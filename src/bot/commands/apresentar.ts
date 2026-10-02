import { ICommand } from './types';
import { isMaster } from '../../services/permissions';
import { findParticipant } from '../../services/groupAdmin';
import { getOrCreateSession } from '../../services/presentationService';
import { isPresentationEnabled, isGroupInCommunity, COMMUNITY_085_ID } from '../../services/welcomeService';
import { groupTag } from './format';
import { logInfo } from '../../services/loggerService';

/**
 * $apresentar — inicia uma apresentação explicitamente.
 *
 * Gatilho MUITO FORTE: funciona mesmo para membro antigo (não depende de
 * "entrou há 30 minutos"). A sessão coleta as próximas mensagens do usuário
 * até a janela de inatividade (10 min).
 *
 * Requer: grupo na Comunidade 085 E presentation_enabled = 1.
 */
export const apresentarCommand: ICommand = {
  name: 'apresentar',
  description: 'Inicia sua apresentação no grupo (será publicada no Telegram).',
  async execute(ctx) {
    const chat = await ctx.getChat();

    if (!chat.isGroup) {
      await ctx.reply('❌ Este comando só pode ser usado em grupos.');
      return;
    }

    const groupId = chat.id;
    const userId = ctx.userId;

    // 1. Precisa estar na Comunidade 085
    const inCommunity = await isGroupInCommunity(groupId, COMMUNITY_085_ID);
    if (!inCommunity) {
      await ctx.reply(
        `❌ Este grupo **não pertence à Comunidade 085**.\n` +
        `Apresentações só funcionam em grupos da Comunidade 085.${groupTag(ctx)}`
      );
      return;
    }

    // 2. Precisa ter presentation_enabled = 1
    const enabled = await isPresentationEnabled(groupId);
    if (!enabled) {
      await ctx.reply(
        `⛔ Apresentações estão **DESATIVADAS** neste grupo.\n` +
        `Um administrador deve usar \`$apresentacao on\` para ativar.${groupTag(ctx)}`
      );
      return;
    }

    // Autorização: qualquer membro pode se apresentar (não é comando admin).
    const session = getOrCreateSession(groupId, userId, 'command');

    logInfo(`[apresentar] sessão iniciada`, { groupId, userId, trigger: 'command' });

    await ctx.reply(
      `📝 *Modo apresentação ativado!*\n\n` +
      `Envie suas mensagens agora (nome, idade, trabalho, hobbies, foto...).\n` +
      `Quando parar de enviar por 10 minutos, sua apresentação será consolidada e publicada no Telegram.${groupTag(ctx)}`
    );
  }
};
