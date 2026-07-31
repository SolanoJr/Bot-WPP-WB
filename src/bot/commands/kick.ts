import { ICommand } from "./types";
import { cleanId, isMaster } from "../../services/permissions";

export const kickCommand: ICommand = {
  name: "kick",
  description: "Remove um usuário do grupo.",

  async execute(ctxOrMsg: any, maybeClient?: any, maybeArgs?: any) {
    console.log('[kick] ===== INÍCIO DO COMANDO =====');
    console.log('[kick] ctxOrMsg:', JSON.stringify(ctxOrMsg).substring(0, 200));
    console.log('[kick] maybeClient:', !!maybeClient);
    console.log('[kick] maybeArgs:', maybeArgs);
    
    // Suporte a CommandContext (novo) e parâmetros legados (antigo)
    const isContext = ctxOrMsg && typeof ctxOrMsg === 'object' && 'msg' in ctxOrMsg;
    const msg = isContext ? ctxOrMsg.msg : ctxOrMsg;
    const client = isContext ? (ctxOrMsg.client as any).getClient?.() || ctxOrMsg.client : maybeClient;
    const args = isContext ? ctxOrMsg.args : maybeArgs;
    
    console.log('[kick] isContext:', isContext);
    console.log('[kick] msg:', !!msg);
    console.log('[kick] msg.id:', msg?.id);
    console.log('[kick] msg.chatId:', msg?.chatId);
    console.log('[kick] msg.userId:', msg?.userId);
    console.log('[kick] msg.author:', msg?.author);
    console.log('[kick] msg.from:', msg?.from);
    console.log('[kick] msg.mentionedIds:', msg?.mentionedIds);
    console.log('[kick] msg.hasQuotedMsg:', msg?.hasQuotedMsg);
    console.log('[kick] client:', !!client);
    console.log('[kick] args:', args);

    try {
      // Verificar se msg existe e tem método getChat
      if (!msg || typeof msg.getChat !== 'function') {
        console.error("[kick] msg inválido ou sem getChat:", msg);
        const replyText = "❌ Erro: mensagem inválida ou formato não suportado.";
        if (isContext) await ctxOrMsg.reply(replyText);
        else if (msg && typeof msg.reply === 'function') await msg.reply(replyText);
        return;
      }

      console.log('[kick] Chamando msg.getChat()...');
      const chat = await msg.getChat();
      console.log('[kick] chat obtido:', !!chat, 'chat.id:', chat?.id, 'chat.isGroup:', chat?.isGroup);
      
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
      console.log('[kick] senderId:', senderId);
      console.log('[kick] chat.id._serialized:', chat.id?._serialized);
      console.log('[kick] chat.id:', chat.id);
      
      // Reutilizar o chat já obtido - não chamar getChatById() novamente
      const freshChat = chat;
      console.log('[kick] Reutilizando chat obtido anteriormente');
      const participants = freshChat.participants || [];
      console.log('[kick] participantes:', participants.length);
      
      const botId = cleanId(client.info?.wid?._serialized || "");
      console.log('[kick] botId:', botId);
      const botPart = participants.find((p: any) => cleanId(p.id?._serialized || "") === botId);
      console.log('[kick] botPart:', !!botPart, 'isAdmin:', botPart?.isAdmin, 'isSuperAdmin:', botPart?.isSuperAdmin);
      
      // Tentar encontrar sender comparando de todas as formas possíveis (incluindo LID)
      const senderPart = participants.find((p: any) => {
        const pId = p.id?._serialized || "";
        const pIdClean = cleanId(pId);
        const senderIdRaw = msg.userId || msg.author || msg.from;
        return pIdClean === cleanId(senderId) || pId === senderIdRaw || (senderId && pId.includes(senderId));
      });
      console.log('[kick] senderPart:', !!senderPart, 'isAdmin:', senderPart?.isAdmin, 'isSuperAdmin:', senderPart?.isSuperAdmin);

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
