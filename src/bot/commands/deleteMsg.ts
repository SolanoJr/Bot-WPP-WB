import { findMessageCapture } from '../../services/captureStore';
import { ICommand } from './types';
import { CommandContext } from '../../platforms/base/PlatformTypes';
import { isProtectedTarget } from '../../services/permissions';
import { logInfo, logWarning, logError } from '../../services/loggerService';

// Apaga a mensagem citada com a key original retida pelo capture-store.
// Uso: responda (quote) a uma mensagem e envie "$delete".
export const deleteMsgCommand: ICommand = {
  name: 'delete',
  description: 'Apaga a mensagem citada (apenas dono ou admin do grupo).',

  async execute(ctx: CommandContext) {
    const observer = (ctx.msg.metadata as any)?.deleteE2EObserver;
    const report = (stage: string, details?: Record<string, any>) => {
      if (typeof observer === 'function') {
        try {
          if (details === undefined) observer(stage);
          else observer(stage, details);
        } catch { /* observabilidade de laboratório é best-effort */ }
      }
    };

    try {
      if (!ctx.isMaster && !ctx.isAdmin) {
        report('authorization-denied');
        logWarning('[delete] execução negada: ator não é dono nem admin', { userId: ctx.userId, chatId: ctx.chatId });
        await ctx.reply('⛔ Este comando só pode ser usado pelo dono ou por um admin do grupo.');
        return;
      }
      if (!ctx.isGroup || !ctx.platform.startsWith('whatsapp')) {
        report('unsupported-context');
        await ctx.reply('⚠️ Este comando requer um grupo WhatsApp.');
        return;
      }

      const msgObj: any = (ctx.msg && (ctx.msg.raw || ctx.msg)) || ctx;
      const cinfo: any = msgObj?.message?.extendedTextMessage?.contextInfo
        || msgObj?.contextInfo
        || (ctx.msg as any)?.raw?.contextInfo
        || {};
      const stanzaId = typeof cinfo.stanzaId === 'string' ? cinfo.stanzaId : '';
      if (!stanzaId) {
        report('missing-quote');
        await ctx.reply('⚠️ Responda (cite) a mensagem que deseja apagar.');
        return;
      }

      const chatJid = String(msgObj?.key?.remoteJid || ctx.chatId).replace(/^wpp:/, '');
      const capture = await findMessageCapture(chatJid, stanzaId);
      const originalKey = capture?.key || capture?.rawPayloadSafe?.key || null;
      if (!originalKey || originalKey.id !== stanzaId || originalKey.remoteJid !== chatJid) {
        report('capture-missing', { stanzaId, chatJid });
        logWarning('[delete] exclusão recusada: captura original exata não encontrada', { stanzaId, chatJid });
        await ctx.reply('⚠️ Não encontrei a captura original completa desta mensagem; nada foi apagado.');
        return;
      }

      const targetId = originalKey.participant || originalKey.remoteJid;
      if (!ctx.isMaster && (originalKey.fromMe === true || isProtectedTarget(targetId))) {
        report('protected-target', { stanzaId, chatJid });
        logWarning('[delete] admin tentou apagar alvo protegido', { stanzaId, chatJid, originalWAMessageKey: originalKey });
        await ctx.reply('🛡️ Admin não pode apagar mensagem do dono ou do próprio bot.');
        return;
      }

      logInfo('[delete] enviando delete com chave original capturada', {
        stanzaId,
        remoteJid: originalKey.remoteJid,
        participant: originalKey.participant || null,
        fromMe: originalKey.fromMe,
        originalWAMessageKey: originalKey,
      });
      report('delete-started', { stanzaId, chatJid, originalKey });
      const result = await ctx.client.sendMessage(ctx.chatId, '', { delete: originalKey } as any);
      report('delete-accepted', { stanzaId, chatJid, resultId: result?.id });
      logInfo('[delete] mensagem removida', { stanzaId, originalWAMessageKey: originalKey, resultId: result?.id });
    } catch (e: any) {
      report('delete-error', { message: e?.message || String(e) });
      logError('[delete] erro:', e?.message);
      await ctx.reply(`⚠️ Erro ao apagar: ${e?.message || e}`);
    }
  },
};
