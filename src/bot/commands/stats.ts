import { ICommand } from './types';
import { getDb } from '../../services/databaseService';

export const statsCommand: ICommand = {
  name: 'stats',
  description: 'Mostra estatísticas de uso do bot.',
  async execute(msg, client, args) {
    try {
      const db = await getDb();
      
      // 1. Comandos mais usados
      const topCommands = await db.all(
        `SELECT command_name, COUNT(*) as count 
         FROM command_logs 
         GROUP BY command_name 
         ORDER BY count DESC 
         LIMIT 5`
      );

      // 2. Usuários mais ativos
      const topUsers = await db.all(
        `SELECT user_id, COUNT(*) as count 
         FROM command_logs 
         GROUP BY user_id 
         ORDER BY count DESC 
         LIMIT 5`
      );

      // 3. Total de feedbacks
      const feedbackCount = await db.get(
        'SELECT COUNT(*) as total FROM feedbacks'
      );

      let response = `📊 *ESTATÍSICAS DO BOT-WPP* 📊\n\n`;
      
      response += `🔝 *Comandos mais usados:*\n`;
      if (topCommands.length === 0) response += `Nenhum comando registrado.\n`;
      else {
        topCommands.forEach((cmd, i) => {
          response += `${i+1}. ${cmd.command_name}: ${cmd.count}x\n`;
        });
      }

      response += `\n👤 *Usuários mais ativos:*\n`;
      if (topUsers.length === 0) response += `Nenhum usuário registrado.\n`;
      else {
        topUsers.forEach((user, i) => {
          response += `${i+1}. ${user.user_id.split('@')[0]}: ${user.count}x\n`;
        });
      }

      response += `\n💌 *Feedbacks recebidos:* ${feedbackCount?.total || 0}\n`;
      response += `\n_Dados atualizados em tempo real via SQLite_`;

      await msg.reply(response);
    } catch (e) {
      console.error('Erro no comando $stats:', e);
      await msg.reply('⚠️ Erro ao recuperar estatísticas.');
    }
  },
};