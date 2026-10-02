import { ICommand } from './types';
import { isMaster } from '../../services/permissions';
import { findParticipant } from '../../services/groupAdmin';
import {
  isPresentationEnabled,
  setPresentationEnabled,
  getPresentationStatus,
  COMMUNITY_085_ID,
} from '../../services/welcomeService';
import { groupTag } from './format';
import { logInfo } from '../../services/loggerService';

/**
 * $apresentacao — ativa/desativa apresentações no grupo.
 *
 *   $apresentacao on     → ativa
 *   $apresentacao off    → desativa
 *   $apresentacao status → mostra status
 *
 * Requisitos:
 * - Grupo deve pertencer à Comunidade 085
 * - Apenas admin/Master pode alterar
 * - Default: desativado (presentation_enabled = 0)
 * - Persistido em SQLite (group_mod.presentation_enabled)
 */
export const apresentacaoCommand: ICommand = {
  name: 'apresentacao',
  description: 'Ativa/desativa coleta de apresentações no grupo (Apenas Admins).',
  async execute(ctx) {
    const chat = await ctx.getChat();

    if (!chat.isGroup) {
      await ctx.reply('❌ Este comando só pode ser usado em grupos.');
      return;
    }

    const groupId = chat.id;
    const args = (ctx.args || []).map((a: string) => a.toLowerCase());
    const sub = args[0] || 'status';

    // Autorização: MASTER ou admin do grupo
    const isUserMaster = isMaster(ctx.userId);
    let isGroupAdmin = false;
    if (!isUserMaster) {
      const member = findParticipant(chat, ctx.userId);
      isGroupAdmin = Boolean(member && (member.isAdmin || member.isSuperAdmin));
      logInfo(`🛡️ [ADMIN-CHECK] ${ctx.userId} é Admin? ${isGroupAdmin ? 'SIM' : 'NÃO'}`);
    }
    if (!isUserMaster && !isGroupAdmin) {
      logInfo(`🚫 [AUTH-FAIL] $apresentacao negado para ${ctx.userId}`);
      await ctx.reply('❌ Apenas administradores do grupo ou o MASTER do bot podem usar este comando.');
      return;
    }

    // Status (qualquer admin pode ver, não precisa estar na comunidade)
    if (sub === 'status') {
      const status = await getPresentationStatus(groupId);
      const destino = `📍 Destino: tópico *Apresentações* do Telegram *Fortaleza 085* (chat_id: -1003470059875, thread_id: 2)`;
      const emoji = status.enabled ? '✅' : '⛔';
      const comun = status.inCommunity ? '🟢 Na Comunidade 085' : '🔴 FORA da Comunidade 085';
      await ctx.reply(
        `${emoji} *Apresentações:* ${status.enabled ? 'ATIVADA' : 'DESATIVADA'}\n` +
        `${comun}\n` +
        `${destino}\n\n` +
        `Para alterar: \`$apresentacao on\` ou \`$apresentacao off\`${groupTag(ctx)}`
      );
      return;
    }

    // on/off — precisa estar na Comunidade 085
    const inCommunity = await (async () => {
      try {
        const { isGroupInCommunity } = await import('../../services/welcomeService.js');
        return await isGroupInCommunity(groupId, COMMUNITY_085_ID);
      } catch { return false; }
    })();

    if (!inCommunity) {
      await ctx.reply(
        `❌ Este grupo **não pertence à Comunidade 085**.\n` +
        `Apresentações só podem ser ativadas em grupos da Comunidade 085 (identificada pelo linkedParent real do WhatsApp).${groupTag(ctx)}`
      );
      return;
    }

    if (sub === 'on') {
      await setPresentationEnabled(groupId, true);
      await ctx.reply(`✅ Apresentações **ATIVADAS** neste grupo.${groupTag(ctx)}\n\n` +
        `Agora membros podem usar \`$apresentar\` ou responder ao welcome para iniciar a coleta.`);
      return;
    }

    if (sub === 'off') {
      await setPresentationEnabled(groupId, false);
      await ctx.reply(`⛔ Apresentações **DESATIVADAS** neste grupo.${groupTag(ctx)}\n\n` +
        `Novas coletas não serão iniciadas. Sessões existentes continuam até consolidar.`);
      return;
    }

    await ctx.reply(
      `❌ Uso inválido.\n` +
      `\`$apresentacao on\` — ativa\n` +
      `\`$apresentacao off\` — desativa\n` +
      `\`$apresentacao status\` — mostra estado${groupTag(ctx)}`
    );
  }
};