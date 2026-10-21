import { ICommand } from './types';
import { isMaster } from '../../services/permissions';
import { findParticipant } from '../../services/groupAdmin';
import {
  getWelcomeMessage, setWelcomeMessage, composeWelcome,
  DEFAULT_WELCOME, WELCOME_PLACEHOLDERS,
} from '../../services/welcomeService';
import { groupTag } from './format';
import { logInfo, logError } from '../../services/loggerService';

/**
 * $setwelcome — welcome ADITIVO por grupo (INC-012b).
 *
 *   $setwelcome              → mostra o welcome atual
 *   $setwelcome <texto>      → default + "\n\n" + texto (ADITIVO)
 *   $setwelcome --full <txt> → template completo, sem prepender
 *   $setwelcome reset        → volta ao default puro (default|reset)
 *
 * O default 'Boas-vindas @novato 👋' SEMPRE abre a mensagem — a menção
 * do novato nunca se perde. Idempotente: texto que já contém o default,
 * '@novato' ou '{handle}' é considerado template completo e não ganha
 * prepender duplicado (customs legados não quebram).
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

    // ─── reset/default: volta ao padrão puro ───
    const primeiro = String(args[0] || '').toLowerCase();
    if (primeiro === 'reset' || primeiro === 'default') {
      await setWelcomeMessage(groupId, null);
      await ctx.reply(`✅ Welcome resetado para o padrão:\n\n${DEFAULT_WELCOME}${groupTag(ctx)}`);
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
        `Para adicionar texto: \`$setwelcome <texto>\`\n` +
        `Template completo: \`$setwelcome --full <texto>\`\n` +
        `Para restaurar: \`$setwelcome reset\``
      );
      return;
    }

    // ─── --full <texto>: template completo, SEM prepender ───
    const isFull = String(args[0]) === '--full';
    const texto = (isFull ? args.slice(1) : args).join(' ').trim();
    if (!texto) {
      await ctx.reply(
        '❌ Texto vazio. Use `$setwelcome <texto>`, `$setwelcome --full <texto>` ou `$setwelcome reset`.'
      );
      return;
    }

    // ─── <texto>: ADITIVO (default + \n\n + texto), idempotente ───
    const novo = isFull ? texto : composeWelcome(texto);

    try {
      await setWelcomeMessage(groupId, novo);
      const rotulo = isFull ? '✅ Welcome configurado (template completo)' : '✅ Welcome configurado';
      await ctx.reply(`${rotulo}:${groupTag(ctx)}\n\n${novo}`);
    } catch (error) {
      logError('❌ Erro ao definir welcome:', error);
      await ctx.reply('⚠️ Ocorreu um erro ao salvar a configuração. Tente novamente mais tarde.');
    }
  }
};
