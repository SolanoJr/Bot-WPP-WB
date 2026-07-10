import { ICommand } from "./types";
import { cleanId, isMaster } from "../../services/permissions";

export const kickCommand: ICommand = {
  name: "kick",
  description: "Remove um usuário do grupo.",

  async execute(ctxOrMsg: any, maybeClient?: any, maybeArgs?: any) {
    // Suporte a CommandContext (novo) e parâmetros legados (antigo)
    const isContext = ctxOrMsg && typeof ctxOrMsg === 'object' && 'msg' in ctxOrMsg;
    const msg = isContext ? ctxOrMsg.msg : ctxOrMsg;
    const client = isContext ? (ctxOrMsg.client as any).getClient?.() || ctxOrMsg.client : maybeClient;
    const args = isContext ? ctxOrMsg.args : maybeArgs;

    try {
      // Verificar se msg existe e tem método getChat
      if (!msg || typeof msg.getChat !== 'function') {
        console.error("[kick] msg inválido ou sem getChat:", msg);
        const replyText = "❌ Erro: mensagem inválida ou formato não suportado.";
        if (isContext) await ctxOrMsg.reply(replyText);
        else if (msg && typeof msg.reply === 'function') await msg.reply(replyText);
        return;
      }

      const chat = await msg.getChat();
      if (!chat) {
        const replyText = "❌ Erro ao obter informações do chat.";
        if (isContext) await ctxOrMsg.reply(replyText);
        else await msg.reply(replyText);
        return;
      }

      if (!chat.isGroup) {
        const replyText = "❌ Este comando só funciona em grupos.";
        if (isContext) await ctxOrMsg.reply(replyText);
        else await msg.reply(replyText);
        return;
      }

      // 1. Verificação de Permissões
      const senderId = msg.userId || msg.author || msg.from;
      const freshChat = await client.getChatById(chat.id?._serialized || chat.id);
      const participants = freshChat.participants || [];
      
      const botId = cleanId(client.info?.wid?._serialized || "");
      const botPart = participants.find((p: any) => cleanId(p.id?._serialized || "") === botId);
      
      // Tentar encontrar sender comparando de todas as formas possíveis (incluindo LID)
      const senderPart = participants.find((p: any) => {
        const pId = p.id?._serialized || "";
        const pIdClean = cleanId(pId);
        const senderIdRaw = msg.userId || msg.author || msg.from;
        return pIdClean === cleanId(senderId) || pId === senderIdRaw || (senderId && pId.includes(senderId));
      });

      if (!botPart?.isAdmin && !botPart?.isSuperAdmin) {
        const replyText = "❌ O bot precisa ser administrador para remover membros.";
        if (isContext) await ctxOrMsg.reply(replyText);
        else await msg.reply(replyText);
        return;
      }

      if (!senderPart?.isAdmin && !senderPart?.isSuperAdmin && !isMaster(senderId)) {
        const replyText = "❌ Você não tem permissão para usar este comando.";
        if (isContext) await ctxOrMsg.reply(replyText);
        else await msg.reply(replyText);
        return;
      }

      // 2. Identificar Alvo
      let targetId = '';
      if (msg.mentionedIds && msg.mentionedIds.length > 0) {
        targetId = msg.mentionedIds[0];
      } else if (msg.hasQuotedMsg) {
        const quoted = await msg.getQuotedMessage();
        targetId = quoted.author || quoted.from;
      } else if (args.length > 0) {
        targetId = args[0].replace(/\D/g, '') + '@c.us';
      }

      if (!targetId) {
        await msg.reply("❌ Mencione alguém ou responda a uma mensagem para remover.");
        return;
      }

      const targetPart = participants.find((p: any) => cleanId(p.id._serialized) === cleanId(targetId));
      if (targetPart?.isAdmin || targetPart?.isSuperAdmin) {
        await msg.reply("❌ Não é possível remover um administrador.");
        return;
      }

      // 3. Executar Remoção
      await chat.removeParticipants([targetId]);
      await msg.reply(`✅ @${targetId.split('@')[0]} foi removido do grupo.`, { mentions: [targetId] });

    } catch (error: any) {
      console.error("Erro no comando $kick:", error);
      try {
        if (msg && typeof msg.reply === 'function') {
          await msg.reply(`❌ Falha ao executar remoção: ${error.message}`);
        }
      } catch (replyError) {
        console.error("[kick] Falha ao enviar mensagem de erro:", replyError);
      }
    }
  },
};
