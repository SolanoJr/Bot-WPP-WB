import logger from './loggerService';

/**
 * INC-008 — tracker de entrada recente. Alimenta o COMBO ESPECIAL do
 * antibot (estrutura-bot + foreign + primeira mensagem pós-join).
 * Em memória: join é evento volátil — perder a marca num restart só
 * reduz a sensibilidade do combo (falso negativo benigno), nunca
 * cria falso positivo.
 */
const WINDOW_MS = 2 * 60 * 1000; // calibrável: bots disparam em segundos
const recentJoins = new Map<string, number>();

const keyOf = (groupId: string, senderJid: string) => `${groupId}:${senderJid}`;

/** Registra que senderJid entrou no grupo agora (chamado pelo memberJoinService). */
export function markRecentJoin(groupId: string, senderJid: string, at: number = Date.now()): void {
  try {
    recentJoins.set(keyOf(groupId, senderJid), at);
    // limpeza oportunista — Map pequeno, sem timer dedicado
    if (recentJoins.size > 500) {
      const cutoff = at - WINDOW_MS;
      for (const [k, t] of recentJoins) if (t < cutoff) recentJoins.delete(k);
    }
  } catch (e: any) {
    logger.warn('[recentJoinTracker] markRecentJoin falhou', { error: e?.message });
  }
}

/** Consome (UMA vez) a marca de join. true somente na PRÓPRIA primeira
 *  mensagem dentro da janela. Consumo destrutivo: a 2ª mensagem não é
 *  "primeira". */
export function consumeFirstMessage(groupId: string, senderJid: string, at: number = Date.now()): boolean {
  const joinedAt = recentJoins.get(keyOf(groupId, senderJid));
  if (joinedAt === undefined) return false;
  recentJoins.delete(keyOf(groupId, senderJid));
  return (at - joinedAt) <= WINDOW_MS;
}

/** Estado sem consumir (testes/auditoria). */
export function isRecentJoin(groupId: string, senderJid: string, at: number = Date.now()): boolean {
  const joinedAt = recentJoins.get(keyOf(groupId, senderJid));
  return joinedAt !== undefined && (at - joinedAt) <= WINDOW_MS;
}

export function clearRecentJoins(): void {
  recentJoins.clear();
}
