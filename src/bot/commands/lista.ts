import { ICommand } from './types';
import { isMaster } from '../../services/permissions';
import { listLists } from '../../services/listsService';
import { groupTag } from './format';

/**
 * $lista — mostra as listas persistentes do grupo.
 *
 * Funcionalidade real, não comando fantasma. A arquitetura já a suportava
 * (group_mod + databaseService + SQLite), mas o recurso nunca foi ativado.
 */
export const listaCommand: ICommand = {
  name: 'lista',
  description: 'Mostra as listas persistentes configuradas no grupo.',
  async execute(ctx) {
    const chat = await ctx.getChat();
    if (!chat.isGroup) {
      return ctx.reply(`⚠️ O comando $lista só funciona em grupos.${groupTag(ctx)}`);
    }
    const isAdmin = ctx.isMaster || ctx.isAdmin || isMaster(ctx.userId);
    if (!isAdmin) {
      return ctx.reply(`🚫 Apenas administradores podem consultar listas.${groupTag(ctx)}`);
    }
    try {
      const rows = await listLists(chat.id);
      if (!rows.length) {
        return ctx.reply(`📋 Nenhuma lista configurada neste grupo ainda.${groupTag(ctx)}`);
      }
      const lines = rows.map((r: any) => `• ${r.list_name || r.list_id}`);
      return ctx.reply(`📋 *Listas do grupo*\n\n${lines.join('\n')}${groupTag(ctx)}`);
    } catch (e: any) {
      return ctx.reply(`❌ Erro ao consultar listas: ${e.message || e}${groupTag(ctx)}`);
    }
  }
};
