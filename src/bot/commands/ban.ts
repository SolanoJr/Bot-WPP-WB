import { ICommand } from './types';
import { CommandContext } from '../../platforms/base/PlatformTypes';
import { cleanId, isMaster } from '../../services/permissions';

export const banCommand: ICommand = {
  name: 'ban',
  description: 'Bane um usuário do grupo, remove e bloqueia (WhatsApp, Telegram e Discord).',

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

      const botPart = participants.find(p => cleanId(p.id) === botId);
      const senderPart = participants.find(p => cleanId(p.id) === senderId);

      if (!botPart?.isAdmin && !botPart?.isSuperAdmin) {
        await ctx.reply('❌ O bot precisa ser administrador para usar este comando.');
        return;
      }

      const isSenderAdmin = Boolean(senderPart?.isAdmin || senderPart?.isSuperAdmin);
      if (!isSenderAdmin && !isMaster(ctx.userId)) {
        await ctx.reply('❌ Você precisa ser administrador para usar este comando.');
        return;
      }

      const mentioned = ctx.msg.mentions;
      if (!mentioned || mentioned.length === 0) {
        await ctx.reply('❌ Marque o usuário a ser banido com @usuario.');
        return;
      }

      const userToBan = mentioned[0].id;
      const userToBanClean = cleanId(userToBan);

      const userPart = participants.find(p => cleanId(p.id) === userToBanClean);
      if (userPart?.isAdmin || userPart?.isSuperAdmin) {
        await ctx.reply('❌ Não é possível banir administradores.');
        return;
      }

      // Tentar apagar última mensagem do usuário (WhatsApp suporta; demais ignoram silenciosamente)
      let deletedCount = 0;
      try {
        if (ctx.platform === 'whatsapp' && ctx.msg.raw?.chat?.fetchMessages) {
          const messages = await ctx.msg.raw.chat.fetchMessages({ limit: 50 });
          const last = messages.find(
            (m: any) => cleanId(m.author || m.from || '') === userToBanClean && !m.fromMe
          );
          if (last) {
            await last.delete(true);
            deletedCount = 1;
          }
        }
      } catch (delErr) {
        console.warn('[ban] Falha ao apagar mensagem (não crítico):', delErr);
      }

      await ctx.client.banParticipant(ctx.chatId, userToBan);

      await ctx.reply(
        `✅ Usuário banido com sucesso!\n` +
        `🗑️ ${deletedCount > 0 ? 'Última mensagem apagada' : 'Nenhuma mensagem encontrada'}\n` +
        `🚫 Contato bloqueado`
      );
    } catch (error: any) {
      console.error('[ban] Erro:', error);
      await ctx.reply(`❌ Erro ao banir usuário: ${error.message}`);
    }
  },
};
