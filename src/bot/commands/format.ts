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

/**
 * Nome de exibição de um alvo (usuário sendo kickado/banido/etc).
 * Prioriza o nome real do contato (getUser), depois participants do chat,
 * e cai no número limpo se nada vier. Resolve o caso WWebJS moderno (@lid)
 * onde participants não trazem name/pushname e getUser pode retornar o número.
 */
export async function getTargetDisplayName(
  client: any,
  targetId: string,
  participants: any[] = []
): Promise<string> {
  const clean = String(targetId).replace('@c.us', '').replace('@lid', '');
  // 1. Contato real (pushname/name) se o client suportar
  try {
    if (client?.getUser) {
      const u = await client.getUser(targetId);
      const raw: any = (u as any)?.raw || {};
      console.log(`[NAMEDEBUG] getUser(${targetId}) -> name=${JSON.stringify((u as any)?.name)} pushname=${JSON.stringify(raw?.pushname)} nameRaw=${JSON.stringify(raw?.name)} shortName=${JSON.stringify(raw?.shortName)}`);
      const candidates = [
        (u as any)?.name,
        (u as any)?.pushname,
        raw?.pushname,
        raw?.name,
        raw?.shortName,
        raw?.displayName,
      ];
      for (const n of candidates) {
        const s = String(n || '').trim();
        if (s && !/^\d+$/.test(s.replace('@c.us', '').replace('@lid', '')) && !s.startsWith('+')) {
          return s;
        }
      }
    }
  } catch { /* ignore */ }
  // 2. participants do chat
  const part = participants.find((p: any) => {
    const pid = String(p?.id || '').replace('@c.us', '').replace('@lid', '');
    return pid === clean;
  });
  const pn = (part as any)?.name || (part as any)?.pushname || (part as any)?.displayName;
  if (pn && !/^\d+$/.test(String(pn).replace('@c.us', '').replace('@lid', ''))) {
    return String(pn);
  }
  // 3. fallback número
  return clean;
}
