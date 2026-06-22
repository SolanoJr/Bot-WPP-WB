import { ICommand } from "./types";
import { cleanId } from "../../services/permissions";

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
      const senderId = cleanId(msg.author || msg.from);

      const senderParticipant = participants.find(
        (p: any) => cleanId(p.id?._serialized || "") === senderId,
      );

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

      if (!isSenderAdmin) {
        await msg.reply(
          "❌ Você precisa ser administrador para usar este comando.",
        );
        return;
      }

      // Verificar se mencionou alguém
      const mentioned = msg.mentionedIds;

      if (!mentioned || mentioned.length === 0) {
        await msg.reply("❌ Marque o usuário a ser banido.");
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
        // Apagar mensagens do usuário no grupo
        const messages = await chat.fetchMessages({ limit: 100 });

        const userMessages = messages.filter(
          (m: any) => cleanId(m.author || "") === userToBanClean,
        );

        console.log("Debug ban - Messages to delete:", userMessages.length);

        for (const message of userMessages) {
          try {
            await message.delete(true);
            deletedCount++;
          } catch (error) {
            console.error("Erro ao apagar mensagem:", error);
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
        await client.blockContact(userToBan);
      } catch (error) {
        console.error("Erro ao bloquear contato:", error);
      }

      await msg.reply(
        `✅ Usuário banido, ${deletedCount} mensagens apagadas e contato bloqueado.`,
      );
    } catch (error: any) {
      console.error("Erro ao executar comando ban:", error);
      await msg.reply(`❌ Erro ao banir usuário: ${error.message}`);
    }
  },
};
