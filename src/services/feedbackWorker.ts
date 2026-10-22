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
  GROUPING_WINDOW_MS,
} from './feedbackService';
import { logInfo, logWarning } from './loggerService';

export const FEEDBACK_RUN_INTERVAL_MS = 6 * 60 * 60 * 1000;
const MAX_PV_PER_RUN = 10;
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
  expiredSweep: number;
}

/** Uma execução do ciclo de feedback. Retorna estatísticas. */
export async function runFeedbackWorker(
  send: FeedbackSendFn,
  now: number = Date.now(),
): Promise<FeedbackWorkerStats> {
  const stats: FeedbackWorkerStats = {
    sent: 0, failed: 0, cooldown: 0, young: 0, deferred: 0, tooOld: 0, expiredSweep: 0,
  };
  const pending = await listPendingContact();
  const tooOld: string[] = [];

  for (const ev of pending) {
    const age = now - (ev.left_at || 0);
    if (age > PENDING_MAX_AGE_MS) { tooOld.push(ev.event_id); continue; }
    if (age < GROUPING_WINDOW_MS) { stats.young++; continue; }
    const last = await getLastContactAt(ev.user_id);
    if (last !== null && now - last < USER_COOLDOWN_MS) { stats.cooldown++; continue; }
    if (stats.sent + stats.failed >= MAX_PV_PER_RUN) { stats.deferred++; continue; }

    const text = formatFeedbackRequest({
      eventType: ev.event_type,
      groupName: ev.group_name,
      communityName: ev.community_name,
      involvedGroupNames: ev.involved_group_names,
    });
    const ok = await send(ev.user_id, text).catch(() => false);
    if (ok) {
      await markContacted(ev.event_id, now);
      stats.sent++;
    } else {
      stats.failed++;
    }
  }

  if (tooOld.length) {
    await markExpired(tooOld, now);
    stats.tooOld = tooOld.length;
  }
  const expired = await listExpired(now);
  if (expired.length) {
    await markExpired(expired.map((e: any) => e.event_id), now);
    stats.expiredSweep = expired.length;
  }

  if (stats.sent || stats.failed || stats.tooOld || stats.expiredSweep || stats.deferred) {
    logInfo(`[feedbackWorker] sent=${stats.sent} failed=${stats.failed} cooldown=${stats.cooldown} young=${stats.young} deferred=${stats.deferred} tooOld=${stats.tooOld} expiredSweep=${stats.expiredSweep}`);
  }
  return stats;
}

/**
 * Registra o worker no boot (padrão newsScheduler/cleanup: setInterval
 * com unref). Primeira execução 2 min após o ready — evita burst no boot.
 */
export function startFeedbackWorker(
  send: FeedbackSendFn,
  intervalMs: number = FEEDBACK_RUN_INTERVAL_MS,
): NodeJS.Timeout {
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
