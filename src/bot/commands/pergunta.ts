import { ICommand } from './types';
// Correct relative path to services (src/services)
import { askAI } from '../../services/aiService';
import { getDb } from '../../services/databaseService';
import logger from '../../services/loggerService';

export const perguntaCommand: ICommand = {
  name: 'pergunta',
  description: 'Faz uma pergunta inteligente para a IA do bot.',
  async execute(msg, client, args) {
    const prompt = args.join(' ');

    if (!prompt) {
      await msg.reply('⚠️ Por favor, digite sua pergunta após o comando.\nExemplo: $pergunta Qual a capital da França?');
      return;
    }

    const userId = msg.author || msg.from || 'unknown';
    const groupId = msg.from;

    try {
      logger.info(`IA Question: [${userId}] ${prompt}`);

      await msg.reply('⏳ Processando sua pergunta na IA...');
      const response = await askAI(prompt, userId);
      await msg.reply(response);

    } catch (e) {
      logger.error(`Erro no comando $pergunta: ${e}`);
      await msg.reply('⚠️ Desculpe, tive um problema ao processar sua pergunta.');
    }
  },
};
