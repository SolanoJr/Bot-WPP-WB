/**
 * sarcasmoService — automação de resposta sarcástica.
 *
 * INDEPENDENTE do AutoMod. Não modera, não pune.
 *
 * Regra: quando ativado, responde "tenho nada ver com isso sinhô" quando:
 *   1. alguém mencionar o bot;
 *   2. alguém responder/citar uma mensagem do bot;
 *   3. alguém usar a palavra "bot" (detecção por PALAVRA, não substring).
 *
 * Camada determinística para reconhecer referência ao WarriorBlack:
 *   - "warriorblack" / "warrior black"
 *   - menção real ao bot
 *   - reply/quote de mensagem do bot
 *   - "bot" + contexto de chamada direta
 *
 * Proteções obrigatórias:
 *   - fromMe → ignorar
 *   - anti-loop (não responder à própria resposta)
 *   - cooldown por grupo + usuário
 *   - rate limit
 *   - no máximo uma resposta por mensagem
 *   - não responder fora de grupo
 */

export const SARCASMO_TEXT = 'tenho nada ver com isso sinhô';

/** Cooldown padrão: 30 segundos por grupo+usuário. */
export const SARCASMO_COOLDOWN_MS = 30 * 1000;

/** Cooldown global: 5 segundos (evita spam em grupos movimentados). */
export const SARCASMO_GLOBAL_COOLDOWN_MS = 5 * 1000;

// ─── Estado em memória (cooldowns) ──────────────────────────────────────────

/** Mapa: `${groupId}|${userId}` → timestamp da última resposta. */
const userCooldowns = new Map<string, number>();
let lastGlobalResponse = 0;

/** Limpa entradas antigas (chamado periodicamente). */
export function cleanupCooldowns(now: number = Date.now()): void {
  for (const [k, v] of userCooldowns) {
    if (now - v > SARCASMO_COOLDOWN_MS * 2) userCooldowns.delete(k);
  }
}

/** Reseta todos os cooldowns (para testes). */
export function resetCooldowns(): void {
  userCooldowns.clear();
  lastGlobalResponse = 0;
}

/** Verifica se pode responder (cooldowns). */
export function canRespond(groupId: string, userId: string, now: number = Date.now()): boolean {
  if (now - lastGlobalResponse < SARCASMO_GLOBAL_COOLDOWN_MS) return false;
  const key = `${groupId}|${userId}`;
  const last = userCooldowns.get(key) || 0;
  return now - last >= SARCASMO_COOLDOWN_MS;
}

/** Registra que respondeu. */
export function markResponded(groupId: string, userId: string, now: number = Date.now()): void {
  userCooldowns.set(`${groupId}|${userId}`, now);
  lastGlobalResponse = now;
}

// ─── Detecção ───────────────────────────────────────────────────────────────

/**
 * A palavra "bot" como PALAVRA (não substring).
 * "robotização" NÃO dispara; "o bot respondeu" dispara.
 */
export function containsBotWord(text: string): boolean {
  if (!text) return false;
  return /\bbot\b/i.test(text);
}

/**
 * Camada determinística: a mensagem se refere ao WarriorBlack?
 *
 * Sinais (case-insensitive):
 *   - "warriorblack" / "warrior black"
 *   - reply/quote de mensagem do bot
 *   - menção real ao bot
 *   - "bot" + contexto de chamada direta
 *   - APENAS "bot" (palavra) já dispara
 */
export function referencesWarriorBlack(opts: {
  text: string;
  quotedFromMe?: boolean;
  mentionsBot?: boolean;
}): boolean {
  const t = (opts.text || '').toLowerCase();

  // Nome explícito
  if (t.includes('warriorblack') || t.includes('warrior black')) return true;

  // Reply/quote de mensagem do bot
  if (opts.quotedFromMe) return true;

  // Menção real ao bot
  if (opts.mentionsBot) return true;

  // APENAS "bot" (palavra) já dispara
  if (containsBotWord(t)) return true;

  return false;
}

/** Decide se o sarcasmo deve responder a esta mensagem. */
export function shouldRespond(opts: {
  text: string;
  fromMe: boolean;
  isGroup: boolean;
  quotedFromMe?: boolean;
  mentionsBot?: boolean;
}): boolean {
  if (opts.fromMe) return false;               // nunca à própria mensagem
  if (!opts.isGroup) return false;             // só em grupo
  if (!opts.text || !opts.text.trim()) return false;
  return referencesWarriorBlack(opts);
}
