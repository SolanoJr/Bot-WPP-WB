import { ICommand } from './types';
import { CommandContext } from '../../platforms/base/PlatformTypes';

// Comando OCULTO (só dono/bot). Apaga a mensagem que foi marcada/comentada.
// Uso: responda (quote) a uma mensagem e envie "$delete".
export const deleteMsgCommand: ICommand = {
  name: 'delete',
  description: 'OCULTO: apaga a mensagem marcada (apenas dono/bot).',

  async execute(ctx: CommandContext) {
    try {
      const raw: any = (ctx.msg && (ctx.msg.raw || ctx.msg)) || ctx;
      // Mensagem citada (quem o $delete está respondendo)
      let target: any = null;
      if (typeof raw.getQuotedMessage === 'function') {
        try { target = await raw.getQuotedMessage(); } catch { target = null; }
      }
      if (!target && raw.quotedMsg) target = raw.quotedMsg;

      if (!target) {
        await ctx.reply('⚠️ Responda (cite) a mensagem que deseja apagar.');
        return;
      }

      if (typeof target.delete === 'function') {
        await target.delete(true);
        // silencioso: não precisa confirmar
      } else if (target.raw && typeof target.raw.delete === 'function') {
        await target.raw.delete(true);
      } else {
        await ctx.reply('⚠️ Não consegui apagar essa mensagem.');
      }
    } catch (e: any) {
      console.error('[delete] erro:', e?.message);
      await ctx.reply(`⚠️ Erro ao apagar: ${e?.message || e}`);
    }
  }
};
