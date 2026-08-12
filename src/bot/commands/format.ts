/**
 * Helpers de formatação para respostas do bot.
 * Objetivo (pedido do dono): mostrar SEMPRE o nome do grupo e o nome da pessoa
 * quando fizer sentido, para dar contexto nas respostas.
 */

/** Retorna " (Nome do Grupo)" se houver nome de grupo; string vazia caso contrário. */
export function groupTag(ctx: any): string {
  const g = ctx?.groupName || ctx?.msg?.raw?.chat?.name || '';
  return g ? ` (${g})` : '';
}

/** Retorna o nome legível de um usuário (pushname real se disponível, senão o número). */
export function personName(ctx: any, fallbackId?: string): string {
  const name = ctx?.userName || '';
  if (name && !/^\d+$/.test(String(name).replace('@c.us', '').replace('@lid', ''))) {
    return name;
  }
  if (fallbackId) return String(fallbackId).split('@')[0];
  return '';
}
