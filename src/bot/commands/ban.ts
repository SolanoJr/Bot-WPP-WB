import { ICommand } from './types';
import { CommandContext } from '../../platforms/base/PlatformTypes';
import { cleanId, isMaster } from '../../services/permissions';
import { groupTag, getTargetDisplayName } from './format';

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

      // Se as permissões não puderam ser verificadas (WWebJS falhou ao obter
      // participantes — Issue #201838 / chat @lid), NÃO bloquear com erro falso
      // de "precisa ser administrador". Prosseguir e deixar o WWebJS retornar o
      // erro real, se houver.
      const permsVerified = (chat as any).isPermissionsVerified !== false;

      const botPart = participants.find(p => cleanId(p.id) === botId);
      const senderPart = participants.find(p => cleanId(p.id) === senderId);

      if (permsVerified && !botPart?.isAdmin && !botPart?.isSuperAdmin) {
        await ctx.reply('❌ O bot precisa ser administrador para usar este comando.');
        return;
      }

      const isSenderAdmin = Boolean(senderPart?.isAdmin || senderPart?.isSuperAdmin);
      // Se o getChat nao entregou participants confiaveis (senderPart indefinido),
      // verificar admin no groupMetadata (autoritativo) em vez de barrar injustamente.
      let senderIsAdmin = isSenderAdmin;
      if (!senderIsAdmin && !isMaster(ctx.userId) && (ctx.client as any).isParticipantAdmin) {
        try {
          senderIsAdmin = await (ctx.client as any).isParticipantAdmin(ctx.chatId, ctx.userId);
        } catch {
          senderIsAdmin = false;
        }
      }
      if (!senderIsAdmin && !isMaster(ctx.userId)) {
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

      // Nome da pessoa banida (busca contato real; WWebJS @lid nao traz name no participant)
      const bannedName = await getTargetDisplayName(ctx.client, userToBan, participants);

      // Salvar no banco de banidos (persistência - impede re-entrada)
      try {
        const { banUser } = await import('../../services/databaseService');
        await banUser({
          groupId: ctx.chatId,
          userId: userToBan,
          bannedBy: ctx.userId,
          reason: 'Banido por comando'
        });
      } catch (dbErr) {
        console.warn('[ban] Falha ao salvar banido no DB (não crítico):', dbErr);
      }

      const numeroBan = String(userToBan).replace('@c.us', '').replace('@lid', '');
      await ctx.reply(
        ctx.platform === 'whatsapp'
          ? `✅ @${numeroBan} foi banido com sucesso!${groupTag(ctx)}\n` +
            `🗑️ ${deletedCount > 0 ? 'Última mensagem apagada' : 'Nenhuma mensagem encontrada'}\n` +
            `🚫 Contato bloqueado`
          : `✅ ${bannedName || numeroBan} foi banido com sucesso!${groupTag(ctx)}\n` +
            `🗑️ ${deletedCount > 0 ? 'Última mensagem apagada' : 'Nenhuma mensagem encontrada'}\n` +
            `🚫 Contato bloqueado`,
        {
          ...(ctx.platform === 'whatsapp' ? { mentions: [userToBan] } : {}),
        } as any
      );
    } catch (error: any) {
      console.error('[ban] Erro:', error);
      await ctx.reply(`❌ Erro ao banir usuário: ${error.message}`);
    }
  },
};
