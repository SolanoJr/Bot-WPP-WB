import { ICommand } from './types';
import { getDb } from '../../services/databaseService';

export const feedbackCommand: ICommand = {
  name: 'feedback',
  description: 'Envia um feedback ou sugestão para o desenvolvedor.',
  async execute(ctx: any, _client?: any, _args?: any) {
    const feedbackText = args.join(' ');

    if (!feedbackText) {
      await ctx.reply('⚠️ Por favor, digite seu feedback após o comando.\nExemplo: $feedback Adicione mais jogos!');
      return;
    }

    try {
      console.log('[FEEDBACK] Tentando salvar feedback:', feedbackText);
      const db = await getDb();
      console.log('[FEEDBACK] Banco de dados obtido com sucesso');
      
      const payload = msg.msg || msg;
      // Obter informações do contato
      let userName = 'Desconhecido';
      let userNumber = payload.from || payload.author || 'unknown';
      let groupName = '';
      let groupId = '';

      try {
        const contact = await payload.getContact?.();
        if (contact) {
          userName = contact.pushname || contact.name || 'Desconhecido';
          userNumber = contact.number || payload.from || 'unknown';
        }
      } catch (e) {
        console.log('[FEEDBACK] Erro ao obter contato:', e);
      }

      // Verificar se é grupo
      if ((payload.from || '').endsWith('@g.us')) {
        groupId = payload.from;
        try {
          const chat = await ctx.getChat();
          groupName = chat?.name || 'Grupo sem nome';
        } catch (e) {
          console.log('[FEEDBACK] Erro ao obter nome do grupo:', e);
        }
      }
      
      await db.run(
        'INSERT INTO feedbacks (user_id, user_name, user_number, group_id, group_name, message) VALUES (?, ?, ?, ?, ?, ?)',
        [payload.author || payload.from || 'unknown', userName, userNumber, groupId, groupName, feedbackText]
      );
      console.log('[FEEDBACK] Feedback salvo com sucesso');
      
      await ctx.reply('✅ Seu feedback foi enviado com sucesso! Obrigado por ajudar a melhorar o bot. ❤️');
    } catch (e) {
      console.error('[FEEDBACK] Erro ao salvar feedback:', e);
      await ctx.reply('⚠️ Ocorreu um erro ao salvar seu feedback. Tente novamente mais tarde.');
    }
  },
};