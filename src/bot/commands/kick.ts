import { ICommand } from './types';
import { CommandContext } from '../../platforms/base/PlatformTypes';
import { cleanId, isMaster, isProtectedTarget } from '../../services/permissions';
import { groupTag, getTargetDisplayName } from './format';

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

      // PROTEÇÃO: nunca aplicar ação negativa no MASTER ou no próprio bot
      if (isProtectedTarget(targetId)) {
        await ctx.reply('🛡️ Você não pode remover o dono (MASTER) ou o próprio bot.');
        return;
      }

      const targetClean = cleanId(targetId);
      const targetPart = participants.find(p => cleanId(p.id) === targetClean);
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
      console.error('[kick] Erro:', error);
      await ctx.reply(`❌ Falha ao executar remoção: ${error.message}`);
    }
  },
};
