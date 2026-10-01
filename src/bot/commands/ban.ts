import { ICommand } from './types';
import { CommandContext } from '../../platforms/base/PlatformTypes';
import { isMaster, cleanId } from '../../services/permissions';
import { isBotGroupAdmin, isSenderGroupAdmin, findParticipant, adapterProvidesParticipants } from '../../services/groupAdmin';
import { groupTag, getTargetDisplayName } from './format';
import { logInfo, logWarning, logError } from '../../services/loggerService';

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

      // Autorização: fonte única (groupAdmin) — mesma lógica do $kick.
      const botAdmin = isBotGroupAdmin(chat, ctx.client.userId);
      if (!botAdmin.verified) {
        await ctx.reply(
          adapterProvidesParticipants(chat)
            ? '❌ Não foi possível identificar o bot na lista de membros. Tente novamente.'
            : '❌ Este comando exige a lista de membros do grupo, que não está disponível nesta plataforma.'
        );
        return;
      }
      if (!botAdmin.isAdmin) {
        await ctx.reply('❌ O bot precisa ser administrador para usar este comando.');
        return;
      }

      const senderIsAdmin = isSenderGroupAdmin(chat, ctx.userId) || isMaster(ctx.userId);
      if (!senderIsAdmin) {
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

      const userPart = findParticipant(chat, userToBan);
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
        logWarning('[ban] Falha ao apagar mensagem (não crítico):', delErr);
      }

      await ctx.client.banParticipant(ctx.chatId, userToBan);

      // Nome da pessoa banida (busca contato real; WWebJS @lid nao traz name no participant)
      const bannedName = await getTargetDisplayName(ctx.client, userToBan, participants);

      // Salvar no banco de banidos (persistência - impede re-entrada)
      try {
        const { banUser } = await import('../../services/databaseService.js');
        await banUser({
          groupId: ctx.chatId,
          userId: userToBan,
          bannedBy: ctx.userId,
          reason: 'Banido por comando'
        });
      } catch (dbErr) {
        logWarning('[ban] Falha ao salvar banido no DB (não crítico):', dbErr);
      }

      const numeroBan = String(userToBan).replace('@c.us', '').replace('@lid', '');
      // No WhatsApp o nome aparece via MENÇÃO (@numero + mentions, igual ao welcome do novato).
      // Garantimos o nome também no TEXTO (se o WA não renderizar) usando bannedName.
      await ctx.reply(
        ctx.platform === 'whatsapp'
          ? `✅ ${bannedName || '@' + numeroBan} foi banido com sucesso!${groupTag(ctx)}\n` +
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
      logError('[ban] Erro:', error);
      await ctx.reply(`❌ Erro ao banir usuário: ${error.message}`);
    }
  },
};
