/**
 * Utilitários de normalização/conversão de IDs entre formato interno e Baileys.
 *
 * Histórico: a versão anterior de normId fazia `.replace(/:/, '@')`, o que
 * transformava '558581344211:60@s.whatsapp.net' em '558581344211@60@s.whatsapp.net'
 * (ID inválido). O correto é DESCARTAR o sufixo de device e preservar o domínio.
 */

/** Remove prefixo de plataforma (wpp:, tg:, dc:) antes de processar. */
function stripPlatformPrefix(id: string): string {
  return String(id).replace(/^(wpp:|tg:|dc:)/, '');
}

/**
 * Converte ID do Baileys para formato interno (usado em PlatformMessage).
 * - Remove prefixo de plataforma (wpp:|tg:|dc:)
 * - Descarta sufixo de device (:NN)
 * - Converte @s.whatsapp.net → @c.us
 */
export function normId(id: string): string {
  if (!id) return '';
  const s = stripPlatformPrefix(id);
  const at = s.indexOf('@');
  if (at === -1) return s.split(':')[0];
  const user = s.slice(0, at).split(':')[0];
  const domain = s.slice(at);
  // @s.whatsapp.net é o domínio interno do Baileys; o resto do sistema usa @c.us.
  return `${user}${domain === '@s.whatsapp.net' ? '@c.us' : domain}`;
}

/**
 * Converte ID do formato interno para o formato aceito pelo Baileys.
 * - @c.us → @s.whatsapp.net
 * - @g.us e @lid permanecem (Baileys v7 entende @lid diretamente)
 */
export function toJid(id: string): string {
  const clean = stripPlatformPrefix(id);
  if (clean.includes('@g.us')) return clean;
  if (clean.includes('@lid')) return clean;
  return clean.replace('@c.us', '@s.whatsapp.net');
}
