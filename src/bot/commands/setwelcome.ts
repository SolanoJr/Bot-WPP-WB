import { ICommand } from './types';
import { isMaster } from '../../services/permissions';
import { findParticipant } from '../../services/groupAdmin';
import { getWelcomeMessage, setWelcomeMessage, DEFAULT_WELCOME, WELCOME_PLACEHOLDERS } from '../../services/welcomeService';
import { groupTag } from './format';
import { logInfo, logError } from '../../services/loggerService';

/**
 * $setwelcome — welcome configurável por grupo.
 *
 *   $setwelcome           → mostra o welcome atual
 *   $setwelcome <texto>   → substitui
 *   $setwelcome reset     → restaura o padrão
 *
 * Persistido em SQLite (`group_mod.welcome_message`). O Relay NÃO é fonte de
 * verdade: antes este comando gravava no InMemoryRepository do Relay, que
 * reiniciava e perdia tudo — e o bot nunca lia o valor de volta.
 */
export const setwelcomeCommand: ICommand = {
  name: 'setwelcome',
  description: 'Configura a mensagem de boas-vindas do grupo (Apenas Admins).',
  async execute(ctx) {
    const chat = await ctx.getChat();

    if (!chat.isGroup) {
      await ctx.reply('❌ Este comando só pode ser usado em grupos.');
      return;
    }

    // Autorização: MASTER ou admin do grupo (fonte única groupAdmin).
    const isUserMaster = isMaster(ctx.userId);
    let isGroupAdmin = false;
    if (!isUserMaster) {
      const member = findParticipant(chat, ctx.userId);
      isGroupAdmin = Boolean(member && (member.isAdmin || member.isSuperAdmin));
      logInfo(`🛡️ [ADMIN-CHECK] Usuário ${ctx.userId} é Admin? ${isGroupAdmin ? 'SIM' : 'NÃO'}`);
    }
    if (!isUserMaster && !isGroupAdmin) {
      logInfo(`🚫 [AUTH-FAIL] $setwelcome negado para ${ctx.userId}`);
      await ctx.reply('❌ Apenas administradores do grupo ou o MASTER do bot podem usar este comando.');
      return;
    }

    const groupId = chat.id;
    const args = ctx.args || [];

    // ─── reset: volta ao padrão ───
    if (String(args[0] || '').toLowerCase() === 'reset') {
      await setWelcomeMessage(groupId, null);
      await ctx.reply(`✅ Mensagem de boas-vindas restaurada para o padrão:\n\n${DEFAULT_WELCOME}${groupTag(ctx)}`);
      return;
    }

    // ─── sem args: mostra a atual ───
    if (args.length === 0) {
      const custom = await getWelcomeMessage(groupId);
      const atual = custom ?? DEFAULT_WELCOME;
      const origem = custom === null ? '_(padrão do sistema)_' : '_(personalizada)_';
      await ctx.reply(
        `📋 *Boas-vindas atual* ${origem}\n\n${atual}\n\n` +
        `Placeholders: ${WELCOME_PLACEHOLDERS.join(' · ')}\n` +
        `Para alterar: \`$setwelcome <texto>\`\n` +
        `Para restaurar: \`$setwelcome reset\``
      );
      return;
    }

    // ─── define novo texto ───
    const novo = args.join(' ').trim();
    if (!novo) {
      await ctx.reply('❌ Texto vazio. Use `$setwelcome <texto>` ou `$setwelcome reset`.');
      return;
    }

    try {
      await setWelcomeMessage(groupId, novo);
      await ctx.reply(`✅ Mensagem de boas-vindas atualizada!${groupTag(ctx)}\n\n${novo}`);
    } catch (error) {
      logError('❌ Erro ao definir welcome:', error);
      await ctx.reply('⚠️ Ocorreu um erro ao salvar a configuração. Tente novamente mais tarde.');
    }
  }
};
