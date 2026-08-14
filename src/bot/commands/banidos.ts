import { ICommand } from './types';
import { isMaster } from '../../services/permissions';
import { listBanned } from '../../services/databaseService';
import { getTargetDisplayName } from './format';

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
      for (let i = 0; i < bans.length; i++) {
        const ban: any = bans[i];
        const date = new Date(ban.banned_at || Date.now()).toLocaleDateString('pt-BR');
        // Nome real da pessoa (cai no número se não achar)
        let nome = String(ban.user_id).split('@')[0];
        try {
          nome = await getTargetDisplayName(ctx.client, ban.user_id, undefined) || nome;
        } catch { /* ignore */ }
        // Nome do grupo (cai no ID se não achar)
        let grupo = String(ban.group_id).split('@')[0];
        try {
          const chat = await ctx.client.getChat(ban.group_id);
          grupo = (chat as any)?.name || grupo;
        } catch { /* ignore */ }
        list += `${i + 1}. 👤 ${nome}\n`;
        list += `   📍 Grupo: ${grupo}\n`;
        list += `   📅 Data: ${date}\n`;
        list += `   📝 Motivo: ${ban.reason || 'Não informado'}\n\n`;
      }

      await ctx.reply(list);
    } catch (error: any) {
      console.error('❌ Erro ao buscar banidos:', error);
      await ctx.reply('⚠️ Falha ao consultar o banco de dados de banidos.');
    }
  },
};
