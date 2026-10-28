// src/services/feedbackWorker.ts
/**
 * INC-016 B — worker de envio de pedido de feedback (PV).
 *
 * O pipeline ANTES morria no registro: 52 eventos pending acumulados sem
 * nenhum enviador (markContacted/listPendingContact sem chamadores). Este
 * worker fecha o ciclo:
 *
 *   pending → (gate de idade/janela) → PV → contacted → responded|refused|expired
 *
 * Anti-spam: máx 10 PVs por execução; máx 1 PV por usuário a cada 30 dias;
 * saídas mais velhas que 7 dias expiram sem contato; pedidos contatados sem
 * resposta expiram em EXPIRY_MS (7 dias).
 */
import {
  listPendingContact,
  markContacted,
  markExpired,
  listExpired,
  formatFeedbackRequest,
  getLastContactAt,
  isFeedbackEnabledForGroup,
  markAttemptFailed,
  GROUPING_WINDOW_MS,
} from './feedbackService';
import { logInfo, logWarning } from './loggerService';

export const FEEDBACK_RUN_INTERVAL_MS = 6 * 60 * 60 * 1000;
const MAX_PV_PER_RUN = 10;
const MAX_ATTEMPTS = 3;
const PENDING_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const USER_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

/** Injetável para testes: envia o texto ao PV e resolve true/false. */
export type FeedbackSendFn = (userId: string, text: string) => Promise<boolean>;

export interface FeedbackWorkerStats {
  sent: number;
  failed: number;
  cooldown: number;
  young: number;
  deferred: number;
  tooOld: number;
  policy: number;
  unreachable: number;
  attemptsCap: number;
  expiredSweep: number;
}

/** Uma execução do ciclo de feedback. Retorna estatísticas. */
export async function runFeedbackWorker(
  send: FeedbackSendFn,
  now: number = Date.now(),
): Promise<FeedbackWorkerStats> {
  const stats: FeedbackWorkerStats = {
    sent: 0, failed: 0, cooldown: 0, young: 0, deferred: 0,
    tooOld: 0, policy: 0, unreachable: 0, attemptsCap: 0, expiredSweep: 0,
  };
  const pending = await listPendingContact();
  const toExpire: string[] = [];

  for (const ev of pending) {
    const age = now - (ev.left_at || 0);

    if (age > PENDING_MAX_AGE_MS) { toExpire.push(ev.event_id); stats.tooOld++; continue; }
    if (age < GROUPING_WINDOW_MS) { stats.young++; continue; }

    // Política ATUAL do grupo: sem $feedback on não se pede feedback —
    // nem por eventos legados criados antes do gate de entrada (INC-016 A).
    if (!(await isFeedbackEnabledForGroup(ev.group_id))) {
      toExpire.push(ev.event_id);
      stats.policy++;
      continue;
    }

    // INC-024: o requisito do PN com sufixo @s.whatsapp.net é do WhatsApp
    // (Baileys não envia PV para jid @lid isolado). Telegram/Discord mandam
    // DM pelo user_id direto (numérico/snowflake) — checá-los contra
    // @s.whatsapp.net expirava o evento como unreachable antes da 1ª tentativa.
    const platform = ev.platform || 'whatsapp';
    const target = ev.phone_number || ev.user_id;
    if (!target || (platform === 'whatsapp' && !target.includes('@s.whatsapp.net'))) {
      toExpire.push(ev.event_id);
      stats.unreachable++;
      continue;
    }

    if ((ev.attempts || 0) >= MAX_ATTEMPTS) { toExpire.push(ev.event_id); stats.attemptsCap++; continue; }

    const last = await getLastContactAt(ev.user_id);
    if (last !== null && now - last < USER_COOLDOWN_MS) { stats.cooldown++; continue; }

    if (stats.sent + stats.failed >= MAX_PV_PER_RUN) { stats.deferred++; continue; }

    const text = formatFeedbackRequest({
      eventType: ev.event_type,
      groupName: ev.group_name,
      communityName: ev.community_name,
      involvedGroupNames: ev.involved_group_names,
    });
    // Multi-plataforma: resolve o send da plataforma do evento (INC-024);
    // o send injetado (/lab/run-feedback-worker, testes) é o fallback global.
    if (platform !== 'whatsapp' && !getRegisteredFeedbackSend(platform)) {
      // Sem isso o evento caía no fallback WhatsApp SEM nenhuma linha de log
      // (o Baileys tentava DM para um ID de outra plataforma e falhava calado).
      logWarning(`[feedbackWorker] plataforma ${platform} sem send registrado — usando fallback`);
    }
    const fn = getRegisteredFeedbackSend(platform) ?? send;
    const ok = await fn(target, text).catch(() => false);
    if (ok) {
      await markContacted(ev.event_id, now);
      stats.sent++;
    } else {
      const attempts = await markAttemptFailed(ev.event_id, now);
      stats.failed++;
      if (attempts >= MAX_ATTEMPTS) {
        toExpire.push(ev.event_id);
        stats.attemptsCap++;
      }
    }
  }

  if (toExpire.length) await markExpired(toExpire, now);
  const expired = await listExpired(now);
  if (expired.length) {
    await markExpired(expired.map((e: any) => e.event_id), now);
    stats.expiredSweep = expired.length;
  }

  if (stats.sent || stats.failed || stats.tooOld || stats.expiredSweep || stats.deferred
      || stats.policy || stats.unreachable || stats.attemptsCap) {
    logInfo(`[feedbackWorker] sent=${stats.sent} failed=${stats.failed} cooldown=${stats.cooldown} young=${stats.young} deferred=${stats.deferred} tooOld=${stats.tooOld} policy=${stats.policy} unreachable=${stats.unreachable} attemptsCap=${stats.attemptsCap} expiredSweep=${stats.expiredSweep}`);
  }
  return stats;
}

/** Guard contra dupla inicialização no mesmo processo (onReady duplo). */
let workerStarted = false;

/**
 * Registra o worker no boot (padrão newsScheduler/cleanup: setInterval
 * com unref). Primeira execução 2 min após o ready — evita burst no boot.
 */
// ─── Probe p/ E2E do laboratório ────────────────────────────────────────────
// O send registrado pelo startFeedbackWorker (mesma instância que o worker
// periódico usa). A rota /lab/run-feedback-worker do testServer dispara
// runFeedbackWorker com ESTA fn — sem esperar o interval de 6h em teste.
// INC-024 — registry multi-plataforma: uma fn de envio por plataforma.
// O WhatsApp continua sendo o default retrocompat: o send posicional do
// startFeedbackWorker e o send injetado por /lab/testes são o fallback.
const registeredSends = new Map<string, FeedbackSendFn>();

/** Registra a fn de envio de uma plataforma (wiring do multiPlatform). */
export function registerFeedbackSend(platform: string, fn: FeedbackSendFn): void {
  registeredSends.set(platform, fn);
}

/** Send registrado (do worker ou de teste). Sem plataforma → default. */
export function getRegisteredFeedbackSend(platform?: string): FeedbackSendFn | null {
  if (platform) return registeredSends.get(platform) ?? null;
  return registeredSends.get('whatsapp') ?? registeredSends.values().next().value ?? null;
}

export function startFeedbackWorker(
  send: FeedbackSendFn,
  intervalMs: number = FEEDBACK_RUN_INTERVAL_MS,
): NodeJS.Timeout | undefined {
  if (workerStarted) {
    logWarning('[feedbackWorker] já iniciado neste processo — ignorando chamada duplicada');
    return undefined;
  }
  workerStarted = true;
  registeredSends.set('whatsapp', send);
  const tick = async () => {
    try {
      await runFeedbackWorker(send);
    } catch (e: any) {
      logWarning('[feedbackWorker] execução falhou:', e?.message);
    }
  };
  const first = setTimeout(tick, 2 * 60 * 1000);
  first.unref?.();
  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
  logInfo('[feedbackWorker] iniciado (intervalo 6h, máx 10 PV/exec, cooldown 30d/usuário, expira 7d)');
  return timer;
}
