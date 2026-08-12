import { ICommand } from './types';
import { CommandContext } from '../../platforms/base/PlatformTypes';
import { cleanId, isMaster } from '../../services/permissions';

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
      const botId = cleanId(ctx.client.userId);
      const senderId = cleanId(ctx.userId);

      // Se as permissões não puderam ser verificadas (WWebJS falhou ao obter
      // participantes — Issue #201838 / chat @lid), NÃO bloquear com erro falso
      // de "precisa ser administrador". Prosseguir e deixar o WWebJS retornar o
      // erro real, se houver.
      const permsVerified = (chat as any).isPermissionsVerified !== false;

      const botPart = participants.find(p => cleanId(p.id) === botId);
      const senderPart = participants.find(p => cleanId(p.id) === senderId);

      if (permsVerified && !botPart?.isAdmin && !botPart?.isSuperAdmin) {
        await ctx.reply('❌ O bot precisa ser administrador para remover membros.');
        return;
      }

      const isSenderAdmin = Boolean(senderPart?.isAdmin || senderPart?.isSuperAdmin);
      if (!isSenderAdmin && !isMaster(ctx.userId)) {
        await ctx.reply('❌ Você não tem permissão para usar este comando.');
        return;
      }

      // Identificar alvo: menção (@lid ou @c.us) ou mensagem respondida
      const mentioned = ctx.msg.mentions;
      let targetId = '';

      if (mentioned && mentioned.length > 0) {
        targetId = mentioned[0].id.replace('@lid', '@c.us').replace(/^wpp:/, '');
      } else if (ctx.msg.replyToMessageId && ctx.msg.raw?.quoted) {
        const quoted = ctx.msg.raw.quoted;
        targetId = (quoted.author || quoted.from || '').replace('@lid', '@c.us').replace(/^wpp:/, '');
      }

      if (!targetId) {
        await ctx.reply('❌ Mencione alguém ou responda a uma mensagem para remover.');
        return;
      }

      const targetClean = cleanId(targetId);
      const targetPart = participants.find(p => cleanId(p.id) === targetClean);
      if (targetPart?.isAdmin || targetPart?.isSuperAdmin) {
        await ctx.reply('❌ Não é possível remover um administrador.');
        return;
      }

      await ctx.client.removeParticipant(ctx.chatId, targetId);
      await ctx.reply(`✅ @${targetClean.split('@')[0]} foi removido do grupo.`, {
        // Telegram/Discord interpretam mentions via parseMode; no WhatsApp usamos o ID bruto
        ...(ctx.platform === 'whatsapp' ? { mentions: [targetId] } : {}),
      } as any);
    } catch (error: any) {
      console.error('[kick] Erro:', error);
      await ctx.reply(`❌ Falha ao executar remoção: ${error.message}`);
    }
  },
};
