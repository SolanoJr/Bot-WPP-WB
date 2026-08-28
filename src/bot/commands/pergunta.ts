import { ICommand } from './types';
// Correct relative path to services (src/services)
import { askAI } from '../../services/aiService';
import { getDb } from '../../services/databaseService';
import logger from '../../services/loggerService';

export const perguntaCommand: ICommand = {
  name: 'pergunta',
  description: 'Faz uma pergunta inteligente para a IA do bot.',
  async execute(ctx) {
    const args = ctx.args || [];
    const prompt = args.join(' ');

    if (!prompt) {
      await ctx.reply(
        '⚠️ Por favor, digite sua pergunta após o comando.\nExemplo: $pergunta Qual a capital da França?'
      );
      return;
    }

    const userId = ctx.userId || 'unknown';
    const chatId = ctx.chatId || 'unknown';

    try {
      const chat = await ctx.getChat();
      const isGroup = chat.isGroup;

      await ctx.reply('⏳ Processando sua pergunta na IA...');
      const response = await askAI(prompt, userId);
      await ctx.reply(response);

      const db = await getDb();
      await db.run(
        'INSERT INTO command_logs (command_name, user_id, group_id) VALUES (?, ?, ?)',
        ['pergunta', userId, chatId]
      );

      logger.info(`IA Question: [${userId}] ${prompt}`);
    } catch (e) {
      logger.error(`Erro no comando $pergunta: ${e}`);
      await ctx.reply('⚠️ Desculpe, tive um problema ao processar sua pergunta.');
    }
  },
};
