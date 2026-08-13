import { ICommand } from './types';
import { CommandContext } from '../../platforms/base/PlatformTypes';
import { askAI } from '../../services/aiService';

/**
 * Comandos de interação (gerados por IA).
 * Recuperados do código morto (interacao.ts legado) e convertidos para CommandContext.
 */
export const cantadaCommand: ICommand = {
  name: 'cantada',
  description: 'Gera uma cantada inteligente e madura (via IA).',
  async execute(ctx: CommandContext) {
    try {
      const prompt = 'Gere uma cantada inteligente, madura e respeitosa, sem ser infantil. Apenas o texto da cantada.';
      const response = await askAI(prompt, ctx.userId);
      await ctx.reply(`😏 *CONQUISTA:*\n\n${response}`);
    } catch (error: any) {
      await ctx.reply('❌ Não consegui gerar a cantada agora. Tente novamente.');
    }
  },
};

export const fakechatCommand: ICommand = {
  name: 'fakechat',
  description: 'Gera um diálogo simulado inteligente (via IA).',
  async execute(ctx: CommandContext) {
    try {
      const prompt = 'Gere um diálogo curto (3-4 falas) inteligente e sarcástico entre duas pessoas sobre tecnologia ou vida moderna.';
      const response = await askAI(prompt, ctx.userId);
      await ctx.reply(`💬 *SIMULAÇÃO:*\n\n${response}`);
    } catch (error: any) {
      await ctx.reply('❌ Não consegui gerar a simulação agora. Tente novamente.');
    }
  },
};
