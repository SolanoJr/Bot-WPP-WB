import { ICommand } from './types';
import { initQuizTable, getRandomQuiz } from '../../services/quizService';
import { groupTag } from './format';

export const quizCommand: ICommand = {
  name: 'quiz',
  description: 'Inicia um jogo de perguntas geek (comando básico).',
  async execute(ctx) {
    await initQuizTable();
    const chat = await ctx.getChat();
    const groupId = chat.id || 'global';
    const q = await getRandomQuiz(groupId);
    if (!q) {
      return ctx.reply(`🧠 Nenhuma pergunta configurada ainda. Use um comando futuro para adicionar.\n${groupTag(ctx)}`);
    }
    return ctx.reply(`❓ *Quiz Geek* — ${q.category}\n\n${q.question}\n\nUse \`$resposta <sua resposta>\` para tentar. ${groupTag(ctx)}`);
  }
};
