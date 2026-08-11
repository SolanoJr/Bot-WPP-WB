import { ICommand } from './types';
import { getDb, getCommandMetrics } from '../../services/databaseService';

export const statsCommand: ICommand = {
  name: 'stats',
  description: 'Mostra estatísticas de uso do bot.',
  async execute(msg, client, args) {
    try {
      const db = await getDb();

      // 1. Comandos mais usados (geral)
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

      // 3. Métricas por grupo: quantas vezes cada comando foi usado (com nome do grupo)
      const metrics = await getCommandMetrics();

      // 4. Total de feedbacks
      const feedbackCount = await db.get(
        'SELECT COUNT(*) as total FROM feedbacks'
      );

      let response = `📊 *ESTATÍSICAS DO BOT-WPP* 📊\n\n`;

      response += `🔝 *Comandos mais usados (geral):*\n`;
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

      response += `\n📈 *Uso por grupo (comando: vezes):*\n`;
      if (metrics.length === 0) response += `Nenhum dado por grupo.\n`;
      else {
        // Agrupa por grupo para exibição legível
        const byGroup = new Map<string, { name: string; items: string[] }>();
        for (const m of metrics) {
          if (!byGroup.has(m.group_id)) byGroup.set(m.group_id, { name: m.group_name, items: [] });
          byGroup.get(m.group_id)!.items.push(`${m.command_name}: ${m.count}x`);
        }
        let gi = 1;
        for (const [gid, g] of byGroup.entries()) {
          response += `${gi}. ${g.name || gid}\n   ${g.items.join(' | ')}\n`;
          gi++;
        }
      }

      response += `\n💌 *Feedbacks recebidos:* ${feedbackCount?.total || 0}\n`;
      response += `\n_Dados persistidos em SQLite (com nome do grupo)_`;

      await msg.reply(response);
    } catch (e) {
      console.error('Erro no comando $stats:', e);
      await msg.reply('⚠️ Erro ao recuperar estatísticas.');
    }
  },
};