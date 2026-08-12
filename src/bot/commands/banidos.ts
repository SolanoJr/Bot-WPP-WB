import { ICommand } from './types';
import { isMaster } from '../../services/permissions';
import { listBanned } from '../../services/databaseService';

export const banidosCommand: ICommand = {
  name: 'banidos',
  description: 'Lista os usuários banidos registrados no banco de dados local',
  async execute(ctx: any) {
    if (!isMaster(ctx.userId)) {
      return ctx.reply('❌ Apenas o MASTER pode consultar a lista de banidos.');
    }

    try {
      const bans = await listBanned(10);
      if (!bans || bans.length === 0) {
        return ctx.reply('✅ Nenhum usuário banido encontrado no banco de dados.');
      }

      let list = '🚫 **LISTA DE BANIDOS (Últimos 10)**\n\n';
      bans.forEach((ban: any, index: number) => {
        const date = new Date(ban.banned_at || Date.now()).toLocaleDateString('pt-BR');
        list += `${index + 1}. 👤 @${String(ban.user_id).split('@')[0]}\n`;
        list += `   📍 Grupo: ${String(ban.group_id).split('@')[0]}\n`;
        list += `   📅 Data: ${date}\n`;
        list += `   📝 Motivo: ${ban.reason || 'Não informado'}\n\n`;
      });

      await ctx.reply(list);
    } catch (error: any) {
      console.error('❌ Erro ao buscar banidos:', error);
      await ctx.reply('⚠️ Falha ao consultar o banco de dados de banidos.');
    }
  },
};
