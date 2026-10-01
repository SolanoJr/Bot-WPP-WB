import { ICommand } from './types';
import { CommandContext } from '../../platforms/base/PlatformTypes';
import { isMaster, cleanId } from '../../services/permissions';
import { isBotGroupAdmin, isSenderGroupAdmin, findParticipant, adapterProvidesParticipants } from '../../services/groupAdmin';
import { groupTag, getTargetDisplayName } from './format';
import { logInfo, logWarning, logError } from '../../services/loggerService';

export const kickCommand: ICommand = {
  name: 'kick',
  description: 'Remove um usuário do grupo (WhatsApp, Telegram e Discord).',

  async execute(ctx: CommandContext) {
    try {
      const chat = await ctx.getChat();
      if (!chat.isGroup) {
        await ctx.reply('❌ Este comando só funciona em grupos.');
        return;
      }

      const participants = chat.participants || [];

      // Autorização: fonte única (groupAdmin). Reconhece o bot por LID, PN ou
      // PN-com-device — a relação LID↔PN vem do `phoneNumber` do groupMetadata,
      // nunca de conversão artificial.
      const botAdmin = isBotGroupAdmin(chat, ctx.client.userId);
      if (!botAdmin.verified) {
        // Telegram/Discord não expõem a lista de membros → autorização por role
        // é impossível nesses adapters. Mensagem precisa, não "bot não é admin".
        await ctx.reply(
          adapterProvidesParticipants(chat)
            ? '❌ Não foi possível identificar o bot na lista de membros. Tente novamente.'
            : '❌ Este comando exige a lista de membros do grupo, que não está disponível nesta plataforma.'
        );
        return;
      }
      if (!botAdmin.isAdmin) {
        await ctx.reply('❌ O bot precisa ser administrador para remover membros.');
        return;
      }

      const senderIsAdmin = isSenderGroupAdmin(chat, ctx.userId) || isMaster(ctx.userId);
      if (!senderIsAdmin) {
        await ctx.reply('❌ Você não tem permissão para usar este comando.');
        return;
      }

      // Identificar alvo: menção (@lid ou @c.us) ou mensagem respondida.
      // ⚠️ NÃO converter @lid -> @c.us (BUG 33/ARCHITECTURE_FIXES): o WWebJS moderno
      // exige o @lid para remover/enviar. Mantém o ID original; cleanId só p/ comparação.
      const mentioned = ctx.msg.mentions;
      let targetId = '';

      if (mentioned && mentioned.length > 0) {
        targetId = mentioned[0].id;
      } else if (ctx.msg.replyToMessageId && ctx.msg.raw?.quoted) {
        const quoted = ctx.msg.raw.quoted;
        targetId = (quoted.author || quoted.from || '');
      }

      if (!targetId) {
        await ctx.reply('❌ Mencione alguém ou responda a uma mensagem para remover.');
        return;
      }

      const targetPart = findParticipant(chat, targetId);
      if (targetPart?.isAdmin || targetPart?.isSuperAdmin) {
        await ctx.reply('❌ Não é possível remover um administrador.');
        return;
      }

      await ctx.client.removeParticipant(ctx.chatId, targetId);
      // No WhatsApp, o nome é exibido pelo próprio WA a partir da MENÇÃO
      // (mesmo padrão do welcome de novato: @numero + mentions).
      // Em TG/Discord usamos o nome real (getTargetDisplayName).
      const numero = String(targetId).replace('@c.us', '').replace('@lid', '');
      const removedName = await getTargetDisplayName(ctx.client, targetId, participants);
      // No WhatsApp o nome aparece via MENÇÃO (@numero + mentions, igual ao welcome do novato).
      // Garantimos o nome também no TEXTO (se o WA não renderizar) usando removedName.
      const texto = ctx.platform === 'whatsapp'
        ? `✅ ${removedName || '@' + numero} foi removido do grupo${groupTag(ctx)}.`
        : `✅ ${removedName || numero} foi removido do grupo${groupTag(ctx)}.`;
      await ctx.reply(texto, {
        ...(ctx.platform === 'whatsapp' ? { mentions: [targetId] } : {}),
      } as any);
    } catch (error: any) {
      logError('[kick] Erro:', error);
      await ctx.reply(`❌ Falha ao executar remoção: ${error.message}`);
    }
  },
};
