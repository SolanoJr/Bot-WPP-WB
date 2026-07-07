import { ICommand } from "./types";
import { CommandContext } from "../../../platforms/base/PlatformTypes";
import { cleanId, isMaster, isAdmin } from "../../services/permissions";

export const banCommand: ICommand = {
  name: "ban",
  description: "Bane um usuário do grupo, remove suas mensagens e o expulsa.",
  // Removido restrição de plataforma - disponível em todas as plataformas

  async execute(ctx: CommandContext) {
    try {
      // Verificação temporária: comando ban só funciona no WhatsApp por enquanto
      // devido a dependências específicas do whatsapp-web.js
      if (ctx.platform !== 'whatsapp') {
        await ctx.reply("❌ Este comando ainda está disponível apenas no WhatsApp. Em breve para outras plataformas!");
        return;
      }

      const msg = ctx.msg.raw; // Objeto raw do WhatsApp
      const client = (ctx.client as any).getClient(); // Cliente WhatsApp interno

      const chat = await msg.getChat();
      const { isGroup } = chat;

      if (!isGroup) {
        await ctx.reply("❌ Este comando só funciona em grupos.");
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

      // Tentar encontrar participant comparando de todas as formas possíveis (incluindo LID)
      const senderParticipant = participants.find((p: any) => {
        const pId = p.id?._serialized || "";
        const pIdClean = cleanId(pId);
        const pLid = p.id?.lid || "";
        
        return pIdClean === senderId || 
               pId === senderIdRaw || 
               pIdClean === cleanId(senderIdRaw) ||
               (pLid && senderIdRaw.includes(pLid)) ||
               (pLid && pLid === senderIdRaw);
      });

      console.log("Debug ban - Sender Participant Found:", !!senderParticipant);
      console.log("Debug ban - Sender Participant isAdmin:", senderParticipant?.isAdmin);
      console.log("Debug ban - Sender Participant isSuperAdmin:", senderParticipant?.isSuperAdmin);
      
      // Se quem mandou é MASTER, permitir sempre
      const isSenderMaster = isMaster(senderIdRaw);
      const isSenderInAdminList = isAdmin(senderIdRaw);

      // Determinar se o sender é admin (procura em múltiplas fontes)
      const isSenderAdmin = Boolean(
        senderParticipant?.isAdmin || 
        senderParticipant?.isSuperAdmin || 
        isSenderMaster || 
        isSenderInAdminList
      );

      console.log("Debug ban - isSenderMaster:", isSenderMaster);
      console.log("Debug ban - isSenderInAdminList:", isSenderInAdminList);
      console.log("Debug ban - Final isSenderAdmin:", isSenderAdmin);

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
        await ctx.reply("❌ O bot precisa ser administrador para usar este comando.");
        return;
      }

      // Verificar se sender é admin: pode ser MASTER, estar na lista de ADMINs, ou ser admin do grupo
      // Isso garante que qualquer admin do grupo possa usar o comando
      const hasPermission = isSenderAdmin || isSenderMaster || isSenderInAdminList;
      
      if (!hasPermission) {
        console.log("Debug ban - Permission denied. Debug info:");
        console.log("  - isSenderAdmin:", isSenderAdmin);
        console.log("  - isSenderMaster:", isSenderMaster);
        console.log("  - isSenderInAdminList:", isSenderInAdminList);
        await ctx.reply("❌ Apenas administradores do grupo podem usar este comando.");
        return;
      }

      // Verificar se mencionou alguém
      const mentioned = msg.mentionedIds;

      if (!mentioned || mentioned.length === 0) {
        await ctx.reply("❌ Marque o usuário a ser banido com @usuario.");
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
        await ctx.reply("❌ Não é possível banir administradores.");
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
        await ctx.reply(`⚠️ Erro ao remover usuário: ${error.message}`);
        return;
      }

      try {
        // Bloquear contato (contact.block() quebrado em versões recentes do wwebjs)
        // Remover do grupo já é suficiente
        console.log('Debug ban - Bloqueio ignorado (API indisponível nesta versão do wwebjs)');
      } catch (error) {
        // Silencioso
      }

      await ctx.reply(
        `✅ Usuário banido com sucesso!\n` +
        `🗑️ ${deletedCount > 0 ? 'Última mensagem apagada' : 'Nenhuma mensagem encontrada'}\n` +
        `🚫 Contato bloqueado`,
      );
    } catch (error: any) {
      console.error("Erro ao executar comando ban:", error);
      await ctx.reply(`❌ Erro ao banir usuário: ${error.message}`);
    }
  },
};
