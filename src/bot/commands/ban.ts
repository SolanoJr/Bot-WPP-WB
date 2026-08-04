import { ICommand } from "./types";
import { cleanId, isMaster, isAdmin } from "../../services/permissions";

export const banCommand: ICommand = {
  name: "ban",
  description: "Bane um usuário do grupo e apaga suas mensagens recentes.",

  async execute(ctxOrMsg: any, maybeClient?: any, maybeArgs?: any) {
    console.log('[ban] ===== INÍCIO DO COMANDO =====');
    console.log('[ban] ctxOrMsg:', JSON.stringify(ctxOrMsg).substring(0, 200));
    console.log('[ban] maybeClient:', !!maybeClient);
    console.log('[ban] maybeArgs:', maybeArgs);
    
    // Suporte a CommandContext (novo) e parâmetros legados (antigo)
    const isContext = ctxOrMsg && typeof ctxOrMsg === 'object' && 'msg' in ctxOrMsg;
    const msg = isContext ? ctxOrMsg.msg : ctxOrMsg;
    const client = isContext ? (ctxOrMsg.client as any).getClient?.() || ctxOrMsg.client : maybeClient;
    const args = isContext ? ctxOrMsg.args : maybeArgs;
    
    console.log('[ban] isContext:', isContext);
    console.log('[ban] msg:', !!msg);
    console.log('[ban] msg.id:', msg?.id);
    console.log('[ban] msg.chatId:', msg?.chatId);
    console.log('[ban] msg.userId:', msg?.userId);
    console.log('[ban] msg.author:', msg?.author);
    console.log('[ban] msg.from:', msg?.from);
    console.log('[ban] msg.mentionedIds:', msg?.mentionedIds);
    console.log('[ban] msg.hasQuotedMsg:', msg?.hasQuotedMsg);
    console.log('[ban] client:', !!client);
    console.log('[ban] args:', args);

    try {
      // Verificar se msg existe e tem método getChat
      if (!msg || typeof msg.getChat !== 'function') {
        console.error("[ban] msg inválido ou sem getChat:", msg);
        const replyText = "❌ Erro: mensagem inválida ou formato não suportado.";
        if (isContext) await ctxOrMsg.reply(replyText);
        else if (msg && typeof msg.reply === 'function') await msg.reply(replyText);
        return;
      }

      console.log('[ban] Chamando msg.getChat()...');
      const chat = await msg.getChat();
      console.log('[ban] chat obtido:', !!chat, 'chat.id:', chat?.id, 'chat.isGroup:', chat?.isGroup);
      
      if (!chat) {
        const replyText = "❌ Erro ao obter informações do chat.";
        if (isContext) await ctxOrMsg.reply(replyText);
        else await msg.reply(replyText);
        return;
      }

      if (!chat.isGroup) {
        await msg.reply("❌ Este comando só funciona em grupos.");
        return;
      }

      // 1. Verificação de Permissões
      const senderId = msg.userId || msg.author || msg.from;
      console.log('[ban] senderId:', senderId);
      console.log('[ban] chat.id._serialized:', chat.id?._serialized);
      console.log('[ban] chat.id:', chat.id);
      
      // Reutilizar o chat já obtido - não chamar getChatById() novamente
      const freshChat = chat;
      console.log('[ban] Reutilizando chat obtido anteriormente');
      const participants = freshChat.participants || [];
      console.log('[ban] participantes:', participants.length);
      
      const botId = cleanId(client.info?.wid?._serialized || "");
      console.log('[ban] botId:', botId);
      const botPart = participants.find((p: any) => cleanId(p.id?._serialized || "") === botId);
      console.log('[ban] botPart:', !!botPart, 'isAdmin:', botPart?.isAdmin, 'isSuperAdmin:', botPart?.isSuperAdmin);
      
      // Tentar encontrar sender comparando de todas as formas possíveis (incluindo LID)
      // Helper para localizar participante por diversos formatos (string id, objeto com id._serialized, etc.)
      const findParticipant = (searchId: string) => {
        const cleanSearch = cleanId(searchId || '');
        return participants.find((p: any) => {
          if (!p) return false;
          // p pode ser string
          if (typeof p === 'string') {
            return cleanId(p) === cleanSearch || p === searchId || (searchId && p.includes(searchId));
          }
          const candidate = p.id?._serialized || p._serialized || p.id || '';
          return cleanId(candidate) === cleanSearch || candidate === searchId || (searchId && String(candidate).includes(searchId));
        });
      };

      const senderPart = findParticipant(msg.userId || msg.author || msg.from);
      console.log('[ban] senderPart:', !!senderPart, 'isAdmin:', senderPart?.isAdmin, 'isSuperAdmin:', senderPart?.isSuperAdmin);

      const isSenderMaster = isMaster(senderId);
      const isSenderInAdminList = isAdmin(senderId);
      console.log('[ban] isSenderMaster:', isSenderMaster, 'isSenderInAdminList:', isSenderInAdminList);

      const isSenderAdmin = Boolean(
        senderPart?.isAdmin || senderPart?.isSuperAdmin || isSenderMaster || isSenderInAdminList
      );
      console.log('[ban] isSenderAdmin:', isSenderAdmin);

      if (!botPart?.isAdmin && !botPart?.isSuperAdmin) {
        const replyText = "❌ O bot precisa ser administrador para banir membros.";
        if (isContext) await ctxOrMsg.reply(replyText);
        else await msg.reply(replyText);
        return;
      }

      if (!isSenderAdmin) {
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
      } else if (args && args.length > 0) {
        targetId = args[0].replace(/\D/g, '') + '@c.us';
      }

      if (!targetId) {
        await msg.reply("❌ Mencione alguém ou responda a uma mensagem para banir.");
        return;
      }

      const targetPart = ((): any => {
        if (!targetId) return null;
        const cleanTarget = cleanId(targetId);
        return participants.find((p: any) => {
          if (!p) return false;
          if (typeof p === 'string') return cleanId(p) === cleanTarget || p === targetId || (targetId && p.includes(targetId));
          const candidate = p.id?._serialized || p._serialized || p.id || '';
          return cleanId(candidate) === cleanTarget || candidate === targetId || (targetId && String(candidate).includes(targetId));
        });
      })();
      if (targetPart?.isAdmin || targetPart?.isSuperAdmin) {
        await msg.reply("❌ Não é possível banir um administrador.");
        return;
      }

      // 3. Executar Punição
      await msg.reply(`⏳ Processando banimento de @${targetId.split('@')[0]}...`, { mentions: [targetId] });

      // Apagar mensagens (últimas 50)
      try {
        const messages = await chat.fetchMessages({ limit: 50 });
        const toDelete = messages.filter((m: any) => (m.author || m.from) === targetId);
        for (const m of toDelete) {
          await m.delete(true);
        }
      } catch (e) {
        console.error("Erro ao apagar mensagens no ban:", e);
      }

      // Remover do grupo
      await chat.removeParticipants([targetId]);

      // Bloquear contato
      try {
        const contact = await client.getContactById(targetId);
        await contact.block();
      } catch (e) {
        // Ignora erro de bloqueio
      }

      await msg.reply(`🚫 @${targetId.split('@')[0]} foi banido e suas mensagens recentes foram removidas.`, { mentions: [targetId] });

    } catch (error: any) {
      console.error("Erro no comando $ban:", error);
      try {
        if (msg && typeof msg.reply === 'function') {
          await msg.reply(`❌ Falha ao executar banimento: ${error.message}`);
        }
      } catch (replyError: any) {
        console.error("Falha ao enviar mensagem de erro:", replyError);
      }
    }
  }
};