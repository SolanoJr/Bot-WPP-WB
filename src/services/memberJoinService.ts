/**
 * Moderação de ENTRADA de membros — agnóstica de plataforma.
 *
 * Por que este serviço existe:
 * A lógica de entrada vivia SÓ dentro do WhatsAppAdapter (WWebJS, legado). Como
 * produção roda com Baileys (WPP_ENGINE=baileys), nada disso executava: banido
 * que reentrava NÃO era removido, antibots não agia na entrada e as boas-vindas
 * não disparavam. Extraído para cá para que qualquer adapter chame o MESMO
 * código, sem duplicação.
 *
 * SEGURANÇA: toda remoção passa por isProtectedTarget(). O MASTER (dono) e o
 * próprio bot nunca são removidos, mesmo que apareçam banidos por engano.
 */
import { isProtectedTarget } from './permissions';

export interface MemberJoinDeps {
  /** Remove o participante do grupo. */
  removeParticipant(groupId: string, userId: string): Promise<void>;
  /** Envia mensagem no grupo (mentions opcional). */
  sendMessage(groupId: string, text: string, mentions?: string[]): Promise<unknown>;
}

export interface MemberJoinEvent {
  groupId: string;
  /** IDs dos membros que entraram (preserve o domínio original: @lid fica @lid). */
  members: string[];
  /** Nome de exibição, quando a plataforma fornecer (usado pelo antibots). */
  pushname?: string;
}

/**
 * Processa a entrada de membros: registra o horário, aplica ban persistente,
 * antibots/antiestrangeiro e envia boas-vindas conforme o toggle do grupo.
 * Nunca lança: cada etapa é isolada para que uma falha não impeça as seguintes.
 */
export async function handleMemberJoin(deps: MemberJoinDeps, ev: MemberJoinEvent): Promise<void> {
  const { groupId } = ev;
  const members = (ev.members || []).filter(Boolean);
  if (!groupId || members.length === 0) return;

  console.log(`[memberJoin] entrada detectada: grupo=${groupId} membros=${members.join(',')}`);

  // Remoção centralizada com guarda de proteção.
  const tryRemove = async (memberId: string, motive: string): Promise<boolean> => {
    if (isProtectedTarget(memberId)) {
      console.warn(`🛡️ [memberJoin] remoção BLOQUEADA: ${memberId} é MASTER/bot.`);
      return false;
    }
    try {
      await deps.removeParticipant(groupId, memberId);
      const shortId = String(memberId).split('@')[0];
      await deps.sendMessage(groupId, `🚫 @${shortId} ${motive}`, [memberId]).catch(() => {});
      console.log(`[memberJoin] REMOVIDO ${memberId}: ${motive}`);
      return true;
    } catch (e: any) {
      console.error(`[memberJoin] falha ao remover ${memberId}: ${e?.message}`);
      return false;
    }
  };

  // 1) Registrar entrada (usado pelo AutoMod para janela de DDI).
  try {
    const { recordMemberJoin } = await import('./autoModService');
    for (const m of members) recordMemberJoin(groupId, m);
  } catch (e: any) {
    console.error('[memberJoin] erro ao registrar entrada:', e?.message);
  }

  const removidos = new Set<string>();

  // 2) BAN persistente: quem foi banido não reentra.
  try {
    const { isUserBanned } = await import('./databaseService');
    for (const m of members) {
      if (removidos.has(m)) continue;
      // ⚠️ NÃO converter @lid -> @c.us: consultar com o ID como veio.
      if (await isUserBanned(m, groupId)) {
        if (await tryRemove(m, 'foi banido anteriormente e não pode entrar neste grupo.')) removidos.add(m);
      }
    }
  } catch (e: any) {
    console.error('[memberJoin] erro ao verificar banidos:', e?.message);
  }

  // 3) ANTIBOTS / ANTIESTRANGEIRO conforme toggles do grupo.
  try {
    const { getGroupMod } = await import('./databaseService');
    const { isForeignNumber, isBotByPattern } = await import('./autoModService');
    const mod = await getGroupMod(groupId);
    for (const m of members) {
      if (removidos.has(m)) continue;
      let motive = '';
      if (mod.antibotas && isBotByPattern(m, ev.pushname || '')) {
        motive = 'removido: 🤖 BOT detectado por prefixo (número/nome).';
      } else if (mod.antiestrangeiro && isForeignNumber(m)) {
        motive = 'removido: 🚫 número estrangeiro não permitido neste grupo.';
      }
      if (motive && (await tryRemove(m, motive))) removidos.add(m);
    }
  } catch (e: any) {
    console.error('[memberJoin] erro em antibots/antiestrangeiro:', e?.message);
  }

  // 4) Boas-vindas (respeita o toggle group_mod.bemvindo).
  try {
    const restantes = members.filter(m => !removidos.has(m));
    if (restantes.length === 0) return;

    const { getGroupMod } = await import('./databaseService');
    const mod = await getGroupMod(groupId);
    if (!mod.bemvindo) {
      console.log(`[memberJoin] bemvindo DESATIVADO em ${groupId} — pulando saudação`);
      return;
    }

    const { getWelcomeMessage } = await import('../bot/commands/welcome');
    for (const m of restantes) {
      const shortId = String(m).split('@')[0];
      const custom = getWelcomeMessage(groupId);
      const text = custom
        ? String(custom).replace(/@usuario|@user|\{user\}/gi, `@${shortId}`)
        : `👋 Bem-vindo(a) @${shortId}!`;
      await deps.sendMessage(groupId, text, [m]).catch(() => {});
    }
  } catch (e: any) {
    console.error('[memberJoin] erro ao enviar boas-vindas:', e?.message);
  }
}
