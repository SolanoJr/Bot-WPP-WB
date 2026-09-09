import { ICommand } from './types';
import { getDb } from '../../services/databaseService';
import { logInfo, logWarning, logError } from '../../services/loggerService';

export const feedbackCommand: ICommand = {
  name: 'feedback',
  description: 'Envia um feedback ou sugestão para o desenvolvedor.',
  async execute(ctx) {
    const feedbackText = ctx.args.join(' ');

    if (!feedbackText) {
      await ctx.reply('⚠️ Por favor, digite seu feedback após o comando.\nExemplo: $feedback Adicione mais jogos!');
      return;
    }

    try {
      logInfo('[FEEDBACK] Tentando salvar feedback:', feedbackText);
      const db = await getDb();
      logInfo('[FEEDBACK] Banco de dados obtido com sucesso');
      
      // Obter informações do contato
      let userName = 'Desconhecido';
      let userNumber = ctx.userId;
      let groupName = '';
      let groupId = '';

      try {
        const user = await ctx.getUser();
        userName = user.name || 'Desconhecido';
        userNumber = user.id || ctx.userId;
      } catch (e) {
        logInfo('[FEEDBACK] Erro ao obter contato:', e);
      }

      // Verificar se é grupo
      if (ctx.chatId.endsWith('@g.us')) {
        groupId = ctx.chatId;
        try {
          const chat = await ctx.getChat();
          groupName = chat.name || 'Grupo sem nome';
        } catch (e) {
          logInfo('[FEEDBACK] Erro ao obter nome do grupo:', e);
        }
      }
      
      await db.run(
        'INSERT INTO feedbacks (user_id, user_name, user_number, group_id, group_name, message) VALUES (?, ?, ?, ?, ?, ?)',
        [ctx.userId, userName, userNumber, groupId, groupName, feedbackText]
      );
      logInfo('[FEEDBACK] Feedback salvo com sucesso');
      
      await ctx.reply('✅ Seu feedback foi enviado com sucesso! Obrigado por ajudar a melhorar o bot. ❤️');
    } catch (e) {
      logError('[FEEDBACK] Erro ao salvar feedback:', e);
      await ctx.reply('⚠️ Ocorreu um erro ao salvar seu feedback. Tente novamente mais tarde.');
    }
  },
};
