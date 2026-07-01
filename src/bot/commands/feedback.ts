import { ICommand } from './types';
import { getDb } from '../../services/databaseService';

export const feedbackCommand: ICommand = {
  name: 'feedback',
  description: 'Envia um feedback ou sugestão para o desenvolvedor.',
  async execute(msg, client, args) {
    const feedbackText = args.join(' ');

    if (!feedbackText) {
      await msg.reply('⚠️ Por favor, digite seu feedback após o comando.\nExemplo: $feedback Adicione mais jogos!');
      return;
    }

    try {
      console.log('[FEEDBACK] Tentando salvar feedback:', feedbackText);
      const db = await getDb();
      console.log('[FEEDBACK] Banco de dados obtido com sucesso');
      
      // Obter informações do contato
      let userName = 'Desconhecido';
      let userNumber = msg.from || 'unknown';
      let groupName = '';
      let groupId = '';

      try {
        const contact = await msg.getContact();
        userName = contact.pushname || contact.name || 'Desconhecido';
        userNumber = contact.number || msg.from || 'unknown';
      } catch (e) {
        console.log('[FEEDBACK] Erro ao obter contato:', e);
      }

      // Verificar se é grupo
      if (msg.from.endsWith('@g.us')) {
        groupId = msg.from;
        try {
          const chat = await msg.getChat();
          groupName = chat.name || 'Grupo sem nome';
        } catch (e) {
          console.log('[FEEDBACK] Erro ao obter nome do grupo:', e);
        }
      }
      
      await db.run(
        'INSERT INTO feedbacks (user_id, user_name, user_number, group_id, group_name, message) VALUES (?, ?, ?, ?, ?, ?)',
        [msg.author || msg.from || 'unknown', userName, userNumber, groupId, groupName, feedbackText]
      );
      console.log('[FEEDBACK] Feedback salvo com sucesso');
      
      await msg.reply('✅ Seu feedback foi enviado com sucesso! Obrigado por ajudar a melhorar o bot. ❤️');
    } catch (e) {
      console.error('[FEEDBACK] Erro ao salvar feedback:', e);
      await msg.reply('⚠️ Ocorreu um erro ao salvar seu feedback. Tente novamente mais tarde.');
    }
  },
};