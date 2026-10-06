import { ICommand } from './types';
import { CommandContext } from '../../platforms/base/PlatformTypes';
import { readCaptures } from '../../services/captureStore';
import { logInfo, logError } from '../../services/loggerService';

// Comando OCULTO (só dono/bot). Apaga a mensagem que foi marcada/comentada.
// Uso: responda (quote) a uma mensagem e envie "$delete".
//
// DRY-RUN: registra a chave original/candidata e não executa exclusão.
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

      const quotedKey: any = target.key || target;
      const stanzaId = cinfo.stanzaId || quotedKey.id || '';
      const chatJid = msgObj?.key?.remoteJid || ctx.chatId.replace(/^wpp:/, '');
      const captures = readCaptures();
      const capture = [...captures].reverse().find((entry) =>
        entry.source === 'messages.upsert'
        && entry.messageId === stanzaId
        && entry.remoteJid === chatJid
      );
      const originalKey = capture?.key || capture?.rawPayloadSafe?.key || null;
      const observedKey = originalKey || {
        id: stanzaId || null,
        remoteJid: quotedKey.remoteJid || chatJid || null,
        participant: quotedKey.participant || cinfo.participant || cinfo.quotedMessage?.participant || null,
        fromMe: typeof quotedKey.fromMe === 'boolean' ? quotedKey.fromMe : null,
      };

      logInfo('[delete] DRY-RUN quote key capture', {
        mode: 'log-only',
        keySource: originalKey ? 'captured-original' : 'quote-context-candidate',
        keyComplete: !!originalKey,
        stanzaId: stanzaId || null,
        remoteJid: observedKey.remoteJid ?? null,
        participant: observedKey.participant ?? null,
        fromMe: typeof observedKey.fromMe === 'boolean' ? observedKey.fromMe : null,
        originalWAMessageKey: originalKey,
        observedKey,
      });
      return;
    } catch (e: any) {
      logError('[delete] erro:', e?.message);
      await ctx.reply(`⚠️ Erro ao apagar: ${e?.message || e}`);
    }
  },
};
