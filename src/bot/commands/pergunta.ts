import { ICommand } from './types';
// Correct relative path to services (src/services)
import { askAI } from '../../services/aiService';
import { getDb } from '../../services/databaseService';
import logger from '../../services/loggerService';

export const perguntaCommand: ICommand = {
  name: 'pergunta',
  description: 'Faz uma pergunta inteligente para a IA do bot.',
  async execute(ctxOrMsg: any, maybeClient?: any, maybeArgs?: any) {
    // Suporte a CommandContext (novo) e parâmetros legados (antigo)
    const isContext = ctxOrMsg && typeof ctxOrMsg === 'object' && 'msg' in ctxOrMsg;
    const msg = isContext ? ctxOrMsg.msg : ctxOrMsg;
    const args = isContext ? ctxOrMsg.args : maybeArgs;
    
    const prompt = args.join(' ');

    if (!prompt) {
      const replyText = '⚠️ Por favor, digite sua pergunta após o comando.\nExemplo: $pergunta Qual a capital da França?';
      if (isContext) await ctxOrMsg.reply(replyText);
      else await msg.reply(replyText);
      return;
    }

    const userId = msg.userId || msg.author || msg.from || 'unknown';
    const groupId = msg.chatId || msg.from;

    try {
      const db = await getDb();
      await db.run(
        'INSERT INTO command_logs (command_name, user_id, group_id) VALUES (?, ?, ?)',
        ['pergunta', userId, groupId]
      );

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
