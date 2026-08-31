/**
 * Helpers de resolução de ALVO de comandos (kick/ban/mute/promover/delete).
 *
 * Por que este arquivo existe:
 * Cada comando reimplementava a busca de menções e a normalização de ID, com
 * regras divergentes. Isso causou dois bugs reais em produção:
 *
 *  1. `$mute` lia `ctx.mentionedIds`, propriedade que NÃO existe no
 *     CommandContext (as menções vivem em `ctx.msg.mentions`), então nunca
 *     encontrava o alvo e respondia "marque o usuário".
 *  2. `$mute` convertia `@lid` -> `@c.us` ao montar a chave do mute, enquanto o
 *     messageHandler comparava usando o `@lid` original. A chave nunca casava e
 *     o mute era gravado mas jamais aplicado (parecia "funcionar" e não fazia
 *     nada). `$kick` já preservava o `@lid` — daí a divergência.
 *
 * REGRA DE OURO: o identificador do WhatsApp moderno é OPACO. Preserve-o como
 * veio (`@lid` continua `@lid`). Só remova prefixo de plataforma e sufixo de
 * device. NUNCA converta entre domínios.
 */
import { CommandContext, PlatformUser } from '../../platforms/base/PlatformTypes';

/**
 * Normaliza um ID para uso como chave interna e em chamadas de API.
 * Remove o prefixo de plataforma (wpp:/tg:/dc:) e o sufixo de device (':60'),
 * PRESERVANDO o domínio (@c.us / @lid / @g.us).
 */
export function normalizeTargetId(raw: unknown): string {
  if (!raw) return '';
  const s = typeof raw === 'string' ? raw : String((raw as any)?.id ?? raw ?? '');
  if (!s) return '';
  const bare = s.replace(/^(wpp:|tg:|dc:)/, '');
  const at = bare.indexOf('@');
  if (at === -1) return bare.split(':')[0];
  const user = bare.slice(0, at).split(':')[0];   // corta device suffix
  const domain = bare.slice(at);                   // preserva @lid / @c.us / @g.us
  return `${user}${domain}`;
}

/**
 * Extrai os IDs mencionados na mensagem, olhando TODAS as fontes conhecidas.
 * Ordem: ctx.msg.mentions (contrato oficial multiplataforma) -> campos crus do
 * WWebJS/Baileys (mentionedIds / mentionedJid) -> mensagem citada (reply).
 * @returns lista de IDs já normalizados (pode ser vazia).
 */
export function getMentionedIds(ctx: CommandContext): string[] {
  const out: string[] = [];
  const push = (v: unknown) => {
    const id = normalizeTargetId(v);
    if (id && !out.includes(id)) out.push(id);
  };

  const mentions = (ctx.msg as any)?.mentions as PlatformUser[] | undefined;
  if (Array.isArray(mentions)) mentions.forEach(push);

  const raw: any = (ctx.msg as any)?.raw ?? {};
  const rawSources = [
    raw.mentionedIds,
    raw.mentionedJidList,
    raw.message?.extendedTextMessage?.contextInfo?.mentionedJid,
    raw.contextInfo?.mentionedJid,
  ];
  for (const src of rawSources) {
    if (Array.isArray(src)) src.forEach(push);
  }

  return out;
}

/**
 * Resolve o alvo de um comando administrativo: menção explícita ou, na falta
 * dela, o autor da mensagem citada (reply). Devolve '' se não houver alvo.
 */
export function resolveTargetId(ctx: CommandContext): string {
  const mentioned = getMentionedIds(ctx);
  if (mentioned.length > 0) return mentioned[0];

  // Fallback: responder a uma mensagem e mandar o comando.
  const raw: any = (ctx.msg as any)?.raw ?? {};
  const quotedAuthor =
    raw.quotedParticipant ||
    raw._data?.quotedParticipant ||
    raw.message?.extendedTextMessage?.contextInfo?.participant ||
    raw.contextInfo?.participant ||
    '';
  return normalizeTargetId(quotedAuthor);
}
