import { ICommand } from "./types";
import { cleanId, isMaster } from "../../services/permissions";

export const kickCommand: ICommand = {
  name: "kick",
  description: "Remove um usuário do grupo.",

  async execute(msg, client, args) {
    try {
      const chat = await msg.getChat();
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

      if (!botPart?.isAdmin && !botPart?.isSuperAdmin) {
        await msg.reply("❌ O bot precisa ser administrador para remover membros.");
        return;
      }

      if (!senderPart?.isAdmin && !senderPart?.isSuperAdmin && !isMaster(senderId)) {
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
      await msg.reply(`❌ Falha ao executar remoção: ${error.message}`);
    }
  },
};
