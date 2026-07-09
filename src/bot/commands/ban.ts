import { ICommand } from "./types";
import { cleanId, isMaster, isAdmin } from "../../services/permissions";

export const banCommand: ICommand = {
  name: "ban",
  description: "Bane um usuário do grupo e apaga suas mensagens recentes.",

  async execute(msg, client, args) {
    try {
      // Verificar se msg existe e tem método getChat
      if (!msg || typeof msg.getChat !== 'function') {
        console.error("[ban] msg inválido ou sem getChat:", msg);
        if (msg && typeof msg.reply === 'function') {
          await msg.reply("❌ Erro: mensagem inválida ou formato não suportado.");
        }
        return;
      }

      const chat = await msg.getChat();
      if (!chat) {
        await msg.reply("❌ Erro ao obter informações do chat.");
        return;
      }

      if (!chat.isGroup) {
        await msg.reply("❌ Este comando só funciona em grupos.");
        return;
      }

      // 1. Verificação de Permissões
      const senderId = msg.author || msg.from;
      const freshChat = await client.getChatById(chat.id._serialized);
      const participants = freshChat.participants || [];
      
      const botId = cleanId(client.info.wid._serialized);
      const botPart = participants.find((p: any) => cleanId(p.id._serialized) === botId);
      const senderPart = participants.find((p: any) => cleanId(p.id._serialized) === cleanId(senderId));

      const isSenderMaster = isMaster(senderId);
      const isSenderInAdminList = isAdmin(senderId);

      const isSenderAdmin = Boolean(
        senderPart?.isAdmin || senderPart?.isSuperAdmin || isSenderMaster || isSenderInAdminList
      );

      if (!botPart?.isAdmin && !botPart?.isSuperAdmin) {
        await msg.reply("❌ O bot precisa ser administrador para banir membros.");
        return;
      }

      if (!isSenderAdmin) {
        await msg.reply("❌ Você não tem permissão para usar este comando.");
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

      const targetPart = participants.find((p: any) => cleanId(p.id._serialized) === cleanId(targetId));
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
      } catch (replyError) {
        console.error("[ban] Falha ao enviar mensagem de erro:", replyError);
      }
    }
  },
};