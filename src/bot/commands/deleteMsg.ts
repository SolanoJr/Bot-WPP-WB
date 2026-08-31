import { ICommand } from './types';
import { CommandContext } from '../../platforms/base/PlatformTypes';
import { isMaster, isProtectedTarget } from '../../services/permissions';

// Comando OCULTO (só dono/bot). Apaga a mensagem que foi marcada/comentada.
// Uso: responda (quote) a uma mensagem e envie "$delete".
//
// FUNCIONA NO BAILEYS (engine ativo): lê o `key` da mensagem citada e usa
// ctx.client.sendMessage(jid, { delete: { id, fromMe: false, participant } }),
// que o BaileysAdapter repassa ao sock. Não usa a API do WWebJS (target.delete),
// que não existe no Baileys.
export const deleteMsgCommand: ICommand = {
  name: 'delete',
  description: 'OCULTO: apaga a mensagem marcada (apenas dono/bot).',

  async execute(ctx: CommandContext) {
    try {
      const msgObj: any = (ctx.msg && (ctx.msg.raw || ctx.msg)) || ctx;
      const cinfo: any = msgObj?.message?.extendedTextMessage?.contextInfo
        || msgObj?.contextInfo
        || (ctx.msg as any)?.raw?.contextInfo
        || {};

      // Mensagem citada (quem o $delete está respondendo)
      let target: any = null;
      // Baileys pode não entregar contextInfo para citações fromMe; aceita id como arg:
      //   $delete <id-da-mensagem>
      const argId = (ctx.args && ctx.args[0] && String(ctx.args[0]).trim()) || '';
      // WWebJS: msg.getQuotedMessage() / msg.quotedMsg
      if (typeof (ctx.msg as any)?.getQuotedMessage === 'function') {
        try { target = await (ctx.msg as any).getQuotedMessage(); } catch { target = null; }
      }
      if (!target && typeof msgObj?.getQuotedMessage === 'function') {
        try { target = await msgObj.getQuotedMessage(); } catch { target = null; }
      }
      if (!target && (ctx.msg as any)?.quotedMsg) target = (ctx.msg as any).quotedMsg;
      if (!target && msgObj?.quotedMsg) target = msgObj.quotedMsg;
      // Baileys: a citação vem em contextInfo (stanzaId = id da msg citada)
      if (!target && (cinfo.stanzaId || cinfo.quotedMessage)) {
        target = {
          key: {
            id: cinfo.stanzaId,
            remoteJid: msgObj?.key?.remoteJid || ctx.chatId,
            participant: cinfo.participant || cinfo.quotedMessage?.participant,
          },
          text: cinfo.quotedMessage?.conversation || cinfo.quotedMessage?.extendedTextMessage?.text || '',
        };
      }
      // Fallback: $delete <id> passado como argumento (útil quando o Baileys
      // não entrega contextInfo para citações do próprio bot / em grupos)
      if (!target && argId) {
        target = {
          key: {
            id: argId,
            remoteJid: msgObj?.key?.remoteJid || ctx.chatId,
            participant: msgObj?.key?.participant || undefined,
          },
          text: '',
        };
      }

      if (!target) {
        await ctx.reply('⚠️ Responda (cite) a mensagem que deseja apagar.');
        return;
      }

      // PROTEÇÃO: nunca apagar mensagem do MASTER (dono) nem do próprio bot,
      // exceto quando é o próprio dono pedindo (ele pode apagar o que quiser).
      const quotedKey: any = target.key || target;
      const targetAuthor = String(
        quotedKey.participant ||
        quotedKey.remoteJid ||
        target.author ||
        target.from ||
        target?.id?.participant ||
        ''
      ).split('@')[0];
      const targetFull = String(
        quotedKey.participant || quotedKey.remoteJid || target.author || target.from || ''
      );
      if (targetFull && isProtectedTarget(targetFull) && !isMaster(ctx.userId)) {
        await ctx.reply('🛡️ Você não pode apagar mensagens do dono (MASTER) ou do próprio bot.');
        return;
      }

      // Extrai o key da mensagem a ser apagada
      const msgId = quotedKey.id;
      const participant = quotedKey.participant || quotedKey.remoteJid;
      if (!msgId) {
        await ctx.reply('⚠️ Não consegui localizar o ID da mensagem citada.');
        return;
      }

      // fromMe: a mensagem citada é do próprio bot? (WhatsApp exige fromMe:true
      // para apagar mensagem própria, false para apagar de terceiro como admin)
      const botId = (ctx.client as any)?.userId || (ctx as any).botUserId || '';
      const quotedAuthorRaw = String(quotedKey.participant || quotedKey.remoteJid || '');
      const quotedIsFromBot =
        !!quotedKey.fromMe ||
        (botId && quotedAuthorRaw.split('@')[0] === String(botId).split('@')[0]) ||
        quotedAuthorRaw.includes('558581344211');
      const fromMe = !!quotedKey.fromMe || quotedIsFromBot;

      // Baileys: apaga via sendMessage(jid, { delete: { id, fromMe, participant } })
      const chatId = ctx.chatId;
      try {
        await ctx.client.sendMessage(chatId, '', {
          delete: { id: msgId, fromMe, participant: fromMe ? undefined : participant },
        } as any);
        // Silencioso: não confirma (igual ao comportamento anterior do WWebJS)
      } catch (e: any) {
        // Fallback WWebJS (caso rode em adapter legado)
        if (typeof target.delete === 'function') {
          await target.delete(true);
        } else if (target.raw && typeof target.raw.delete === 'function') {
          await target.raw.delete(true);
        } else {
          await ctx.reply(`⚠️ Não consegui apagar: ${e?.message || e}`);
        }
      }
    } catch (e: any) {
      console.error('[delete] erro:', e?.message);
      await ctx.reply(`⚠️ Erro ao apagar: ${e?.message || e}`);
    }
  },
};
