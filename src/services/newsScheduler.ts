import { listEnabledNewsGroups, markNewsSent } from './databaseService';
import { sendNewsToGroup, localStamp } from './newsService';
import { logInfo, logWarning } from './loggerService';

/**
 * Agendador de notícias — um tick por minuto.
 *
 * A cada tick: varre `group_news` com `enabled=1`, e para cada grupo cujo
 * horário já chegou e que ainda não recebeu hoje, busca na IA e envia.
 *
 * Decisões:
 * - `tick(now)` recebe a data por parâmetro → testável sem fake timers globais.
 * - Comparação `HH:MM` é lexicográfica, o que só vale porque o formato é
 *   zero-padded (`'08:00' < '08:01'`). Comparar `Date` aqui reintroduziria o
 *   problema de fuso que o `localStamp` resolve.
 * - Falha no envio (IA fora, circuit breaker aberto) NÃO marca `last_sent_at`:
 *   o próximo tick tenta de novo. Só o envio confirmado marca.
 * - `running` evita overlap se um tick demorar mais que o intervalo.
 * - `unref()` no timer para o scheduler não segurar o shutdown do processo.
 *
 * Timezone: tudo em hora LOCAL do servidor (America/Fortaleza, -03). O
 * agendamento segue o fuso do dono, não o UTC do host — ver docs/BACKLOG.md.
 */

const TICK_MS = 60_000;

let timer: NodeJS.Timeout | null = null;
let running = false;

export interface NewsTickStats {
  checked: number;
  sent: number;
  skipped: number;
  failed: number;
}

const ZERO_STATS: NewsTickStats = { checked: 0, sent: 0, skipped: 0, failed: 0 };

/** Hora local em `HH:MM` (zero-padded). */
export function nowHHMM(d: Date = new Date()): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * Data local em `YYYY-MM-DD`.
 *
 * NUNCA trocar por `toISOString()`: às 22:00 local o UTC já é o dia seguinte e
 * o scheduler concluiria "já enviou hoje" cedo demais.
 */
export function todayLocal(d: Date = new Date()): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Um ciclo do agendador. Exportado para teste (e para o `startNewsScheduler`). */
export async function tick(now: Date = new Date()): Promise<NewsTickStats> {
  if (running) return { ...ZERO_STATS };
  running = true;
  try {
    if (process.env.WPP_NEWS_ENABLED === 'false') {
      logInfo('[news] scheduler desabilitado via WPP_NEWS_ENABLED=false');
      return { ...ZERO_STATS };
    }

    const rows = await listEnabledNewsGroups();
    const nowStr = nowHHMM(now);
    const today = todayLocal(now);
    const stats: NewsTickStats = { checked: rows.length, sent: 0, skipped: 0, failed: 0 };

    for (const row of rows) {
      // Já enviou hoje? (a data de lastSentAt é o prefixo `YYYY-MM-DD`)
      if (row.lastSentAt && row.lastSentAt.slice(0, 10) === today) {
        stats.skipped++;
        continue;
      }
      // O horário agendado ainda não chegou?
      if (nowStr < row.scheduleTime) {
        stats.skipped++;
        continue;
      }

      try {
        await sendNewsToGroup(row.groupId, row.topic, row.itemCount);
        await markNewsSent(row.groupId, localStamp(now));
        stats.sent++;
      } catch (e: any) {
        stats.failed++;
        logWarning('[news] falha ao enviar', {
          groupId: row.groupId,
          err: String(e?.message || e),
        });
        // NÃO marca last_sent_at — o próximo tick tenta de novo.
      }
    }

    return stats;
  } finally {
    running = false;
  }
}

/** Liga o tick periódico. Idempotente: chamar 2x não cria um segundo timer. */
export function startNewsScheduler(): void {
  if (timer) return;
  timer = setInterval(() => { void tick(); }, TICK_MS);
  timer.unref(); // não segura o processo no shutdown
  logInfo(`[news] scheduler iniciado (tick ${TICK_MS}ms)`);
}

/** Desliga o tick periódico. */
export function stopNewsScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
