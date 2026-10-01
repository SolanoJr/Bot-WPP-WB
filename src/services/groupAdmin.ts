/**
 * Identificação de admin de grupo — fonte única de verdade para $kick / $ban.
 *
 * Problema que este módulo resolve (comprovado em produção):
 *
 *   Participantes do grupo (groupMetadata):
 *     { id: "2592935567439@lid", phoneNumber: "558581344211@s.whatsapp.net", admin: "admin" }
 *
 *   ctx.client.userId:
 *     "558581344211:81@s.whatsapp.net"
 *
 *   O bot aparece como @lid nos participantes, mas é conhecido pelo PN (+device
 *   suffix) no resto do sistema. Comparar só `cleanId()` NUNCA casa:
 *     cleanId("2592935567439@lid")            → "2592935567439"
 *     cleanId("558581344211:81@s.whatsapp.net") → "558581344211"
 *
 * A relação LID↔PN NÃO é derivável por cálculo — ela só existe no metadata do
 * grupo (campo `phoneNumber`) ou nos aliases configurados do bot. Este módulo
 * usa essa relação REAL, sem inventar conversão entre LID e telefone.
 */

import { cleanId, isBotTarget } from './permissions';

/**
 * ⚠️ IDENTIDADE DO BOT — não hardcoded aqui.
 *
 * Fontes usadas, em ordem de prioridade:
 *   1) identidade real do socket/client → `botUserId` (ctx.client.userId)
 *   2) `phoneNumber` do groupMetadata   → relação LID↔PN real do WhatsApp
 *   3) aliases de ambiente              → `isBotTarget()` (mecanismo OFICIAL já
 *      existente em services/permissions.ts, que lê BOT_NUMBER/BOT_LID do .env
 *      e cobre device suffix e @lid)
 *
 * Não existe tabela de aliases neste módulo — quem conhece os aliases do bot é
 * `permissions.ts`. Duplicar aqui criaria uma segunda fonte de verdade.
 */

/** Formato normalizado de participante usado pelos comandos. */
export interface GroupParticipant {
  id: string;              // "2592935567439@lid" | "558581344211@s.whatsapp.net"
  phoneNumber?: string;    // PN associado ao LID, quando o metadata fornece
  isAdmin: boolean;
  isSuperAdmin: boolean;
  raw?: any;
}

/** Normaliza um participante cru do metadata (Baileys/Telegram/Discord) para GroupParticipant. */
export function normalizeParticipant(p: any): GroupParticipant {
  // Compatibilidade: entradas legadas podiam ser uma string com o ID.
  if (typeof p === 'string') {
    return { id: p, isAdmin: false, isSuperAdmin: false, raw: p };
  }
  const admin = p?.admin ?? null;
  return {
    id: String(p?.id ?? p?._serialized ?? ''),
    phoneNumber: p?.phoneNumber ?? p?.phone_number ?? undefined,
    // "superadmin" implica admin (é um nível acima), então isAdmin cobre ambos.
    isAdmin: admin === 'admin' || admin === 'superadmin' || p?.isAdmin === true || p?.isSuperAdmin === true,
    isSuperAdmin: admin === 'superadmin' || p?.isSuperAdmin === true,
    raw: p,
  };
}

/**
 * O participante é o próprio bot?
 *
 * Reconhece o bot independentemente de como ele aparece:
 *   - LID            ("2592935567439@lid")
 *   - PN             ("558581344211@s.whatsapp.net")
 *   - com device     ("558581344211:81@s.whatsapp.net")
 *   - PN no metadata ("phoneNumber" associado ao LID)
 *
 * Fontes de identidade, em ordem:
 *   1) `botUserId` — identidade real do socket/client
 *   2) `phoneNumber` do participante — relação LID↔PN REAL do WhatsApp
 *   3) `isBotTarget()` — aliases oficiais de ambiente (permissions.ts)
 *
 * Não converte @lid em telefone por cálculo: a correspondência vem do metadata
 * ou dos aliases oficiais.
 */
export function isSelfParticipant(
  participant: GroupParticipant | any,
  botUserId: string,
): boolean {
  const p = typeof participant === 'string' || participant?.isAdmin === undefined
    ? normalizeParticipant(participant)
    : participant;

  // 1) Identidade real do socket/client
  const botClean = cleanId(botUserId);
  if (botClean) {
    for (const c of [p.id, p.phoneNumber].filter(Boolean) as string[]) {
      if (cleanId(c) === botClean) return true;
    }
  }

  // 2) + 3) Relação real do metadata e aliases oficiais de ambiente
  for (const c of [p.id, p.phoneNumber].filter(Boolean) as string[]) {
    if (isBotTarget(c)) return true;
  }

  return false;
}

export interface BotAdminResult {
  /** O metadata foi obtido e a identidade do bot foi localizada nele. */
  verified: boolean;
  /** O bot é admin (ou superadmin) do grupo. Só é significativo se verified. */
  isAdmin: boolean;
  /** Origem da informação — para log/auditoria. */
  source: 'participants' | 'none';
  /** O participante do bot, quando localizado. */
  botParticipant?: GroupParticipant;
}

/**
 * O bot é admin deste grupo?
 *
 * Regras:
 *  - Sem participantes → verified:false, isAdmin:false (NÃO assumir admin).
 *  - Participantes presentes mas bot não localizado → verified:false (NÃO assumir).
 *  - Bot localizado → verified:true, isAdmin conforme admin/superadmin.
 *
 * Nunca transforma falha de identificação em autorização.
 */
export function isBotGroupAdmin(
  chat: { participants?: any[] } | null | undefined,
  botUserId: string,
): BotAdminResult {
  const raw = chat?.participants;
  if (!Array.isArray(raw) || raw.length === 0) {
    return { verified: false, isAdmin: false, source: 'none' };
  }

  const participants = raw.map(normalizeParticipant);
  const botParticipant = participants.find(p => isSelfParticipant(p, botUserId));

  if (!botParticipant) {
    return { verified: false, isAdmin: false, source: 'none' };
  }

  return {
    verified: true,
    isAdmin: Boolean(botParticipant.isAdmin || botParticipant.isSuperAdmin),
    source: 'participants',
    botParticipant,
  };
}

/**
 * O adapter desta plataforma expõe a lista de participantes do grupo?
 *
 * Telegram e Discord retornam `participants: []` (os adapters não buscam a lista
 * de membros). Nesses casos a autorização por role é IMPOSSÍVEL — e o comando
 * deve recusar com uma mensagem precisa, não com "bot precisa ser administrador".
 */
export function adapterProvidesParticipants(chat: { participants?: any[] } | null | undefined): boolean {
  return Array.isArray(chat?.participants) && chat!.participants!.length > 0;
}

/**
 * O remetente é admin do grupo?
 * Mesma fonte de verdade do bot — evita lógica divergente entre comandos.
 */
export function isSenderGroupAdmin(
  chat: { participants?: any[] } | null | undefined,
  senderId: string,
): boolean {
  const raw = chat?.participants;
  if (!Array.isArray(raw) || raw.length === 0) return false;

  const senderClean = cleanId(senderId);
  if (!senderClean) return false;

  return raw.map(normalizeParticipant).some(p => {
    const idClean = cleanId(p.id);
    const pnClean = cleanId(p.phoneNumber || '');
    return (idClean === senderClean || pnClean === senderClean) &&
      (p.isAdmin || p.isSuperAdmin);
  });
}

/** Localiza um participante pelo ID (aceita LID ou PN), respeitando o PN do metadata. */
export function findParticipant(
  chat: { participants?: any[] } | null | undefined,
  userId: string,
): GroupParticipant | undefined {
  const raw = chat?.participants;
  if (!Array.isArray(raw)) return undefined;

  const clean = cleanId(userId);
  if (!clean) return undefined;

  return raw.map(normalizeParticipant).find(p => {
    const idClean = cleanId(p.id);
    const pnClean = cleanId(p.phoneNumber || '');
    return idClean === clean || pnClean === clean;
  });
}
