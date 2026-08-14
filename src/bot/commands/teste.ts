import { ICommand } from './types';

// Comando de auto-teste do Hermes: manda "$<arg>" no grupo para exercitar
// o fluxo real de comando SEM precisar reiniciar o bot.
// Uso: $teste conselhob  -> manda "$conselhob" no grupo
export const testeCommand: ICommand = {
  name: 'teste',
  description: 'Auto-teste do Hermes: manda "$<arg>" no grupo para validar o comando real (sem restart).',
  async execute(ctx: any) {
    const alvo = (ctx.args || [])[0];
    if (!alvo) {
      await ctx.reply('⚠️ Uso: $teste <comando>  (ex: $teste conselhob)');
      return;
    }
    const cmd = alvo.startsWith('$') ? alvo : '$' + alvo;
    await ctx.reply(`🧪 [teste] mandando \`${cmd}\` no grupo...`);
    await ctx.client.sendMessage(ctx.chatId, cmd);
  },
};
