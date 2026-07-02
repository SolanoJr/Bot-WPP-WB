import { ICommand } from "./types";
import { cleanId, isMaster } from "../../services/permissions";

export const banCommand: ICommand = {
  name: "ban",
  description: "Bane um usuário do grupo, remove suas mensagens e o expulsa.",

  async execute(msg, client, args) {
    try {
      const chat = await msg.getChat();
      const { isGroup } = chat;

      if (!isGroup) {
        await msg.reply("❌ Este comando só funciona em grupos.");
        return;
      }

      // Recarrega dados para reduzir chance de status de admin desatualizado.
      const freshChat = await client.getChatById(chat.id._serialized);

      const participants = Array.isArray(freshChat?.participants)
        ? freshChat.participants
        : Array.isArray(freshChat?.groupMetadata?.participants)
          ? freshChat.groupMetadata.participants
          : [];

      const botId = cleanId(client?.info?.wid?._serialized || "");

      // Verificar se quem mandou é admin (não o bot)
      // ID bruto (com @c.us) para verificação de MASTER
      const senderIdRaw = msg.author || msg.from;
      const senderId = cleanId(senderIdRaw);

      console.log("Debug ban - Sender ID Raw:", senderIdRaw);
      console.log("Debug ban - Sender ID Clean:", senderId);
      console.log("Debug ban - Participants:", participants.map((p: any) => ({
        id: p.id?._serialized,
        isAdmin: p.isAdmin,
        isSuperAdmin: p.isSuperAdmin
      })));

      // Tentar encontrar participant comparando de todas as formas possíveis
      const senderParticipant = participants.find((p: any) => {
        const pId = p.id?._serialized || "";
        const pIdClean = cleanId(pId);
        // Comparar tanto IDs limpos quanto brutos
        return pIdClean === senderId || pId === senderIdRaw || pIdClean === cleanId(senderIdRaw);
      });

      console.log("Debug ban - Sender Participant:", senderParticipant);
      console.log("Debug ban - Participant IDs for comparison:", participants.slice(0, 3).map((p: any) => ({
        raw: p.id?._serialized,
        clean: cleanId(p.id?._serialized || ''),
        isAdmin: p.isAdmin,
        isSuperAdmin: p.isSuperAdmin
      })));

      const isSenderAdmin = Boolean(
        senderParticipant?.isAdmin || senderParticipant?.isSuperAdmin,
      );

      const botParticipant = participants.find((p: any) => {
        const participantId = cleanId(p.id?._serialized || "");

        return p.isMe || (!!botId && participantId === botId);
      });

      const isBotAdmin = Boolean(
        botParticipant?.isAdmin || botParticipant?.isSuperAdmin,
      );

      console.log("Debug ban - Sender:", senderId);
      console.log("Debug ban - Is sender admin:", isSenderAdmin);
      console.log("Debug ban - Participants count:", participants.length);
      console.log("Debug ban - Is bot admin:", isBotAdmin);

      if (!isBotAdmin) {
        await msg.reply(
          "❌ O bot precisa ser administrador para usar este comando.",
        );
        return;
      }

      // Permitir que o MASTER do bot execute o ban mesmo não sendo admin no grupo
      if (!isSenderAdmin && !isMaster(senderIdRaw)) {
        await msg.reply(
          "❌ Você precisa ser administrador para usar este comando.",
        );
        return;
      }

      // Verificar se mencionou alguém
      const mentioned = msg.mentionedIds;

      if (!mentioned || mentioned.length === 0) {
        await msg.reply("❌ Marque o usuário a ser banido com @usuario.");
        return;
      }

      const userToBan = mentioned[0];

      console.log("Debug ban - User to ban:", userToBan);

      // Verificar se o usuário a ser banido é admin
      const userToBanClean = cleanId(userToBan);

      const userParticipant = participants.find(
        (p: any) => cleanId(p.id?._serialized || "") === userToBanClean,
      );

      const isUserAdmin = Boolean(
        userParticipant?.isAdmin || userParticipant?.isSuperAdmin,
      );

      if (isUserAdmin) {
        await msg.reply("❌ Não é possível banir administradores.");
        return;
      }

      let deletedCount = 0;

      try {
        // Apagar ÚLTIMA mensagem do usuário no grupo (mais eficiente e preciso)
        const messages = await chat.fetchMessages({ limit: 50 });

        // Buscar a última mensagem do usuário (pode incluir view once, mídia, etc)
        const lastUserMessage = messages.find(
          (m: any) => cleanId(m.author || m.from || "") === userToBanClean && !m.fromMe,
        );

        if (lastUserMessage) {
          try {
            await lastUserMessage.delete(true); // true = deletar para todos
            deletedCount = 1;
            console.log("Debug ban - Last message deleted");
          } catch (error) {
            console.error("Erro ao apagar última mensagem:", error);
          }
        }
      } catch (error) {
        console.error("Erro ao buscar mensagens:", error);
      }

      try {
        // Remover usuário do grupo
        await chat.removeParticipants([userToBan]);
        console.log("Debug ban - User removed successfully");
      } catch (error: any) {
        console.error("Erro ao remover usuário:", error);
        await msg.reply(`⚠️ Erro ao remover usuário: ${error.message}`);
        return;
      }

      try {
        // Bloquear contato
        const contact = await client.getContactById(userToBan);
        await contact.block();
        console.log("Debug ban - Contact blocked successfully");
      } catch (error) {
        console.error("Erro ao bloquear contato:", error);
      }

      await msg.reply(
        `✅ Usuário banido com sucesso!\n` +
        `🗑️ ${deletedCount > 0 ? 'Última mensagem apagada' : 'Nenhuma mensagem encontrada'}\n` +
        `🚫 Contato bloqueado`,
      );
    } catch (error: any) {
      console.error("Erro ao executar comando ban:", error);
      await msg.reply(`❌ Erro ao banir usuário: ${error.message}`);
    }
  },
};
