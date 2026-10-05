import { ICommand } from './types';
import { isMaster } from '../../services/permissions';
import { findParticipant } from '../../services/groupAdmin';
import { setGroupModField, getGroupAutomationStatus } from '../../services/databaseService';
import { listFeedback, stats } from '../../services/feedbackService';
import { groupTag } from './format';

/**
 * $feedback — automação de feedback de saída.
 *
 *   $feedback on|off|status  → configuração por grupo (admin)
 *   $feedback lista          → lista feedbacks (admin)
 *   $feedback recentes       → últimos feedbacks (admin)
 *   $feedback grupo <id>     → filtra por grupo (admin)
 *   $feedback estatisticas   → contagens (admin)
 *
 * INDEPENDENTE do AutoMod. Não modera, não pune.
 */
export const feedbackCommand: ICommand = {
  name: 'feedback',
  description: 'Automação de feedback de saída (on/off/status/consultas).',
  async execute(ctx) {
    const chat = await ctx.getChat();
    const args = (ctx.args || []).map((a: string) => a.toLowerCase());
    const sub = args[0] || 'status';

    // ─── Consultas (admin) ───
    if (['lista', 'recentes', 'grupo', 'estatisticas'].includes(sub)) {
      const isAdmin = ctx.isMaster || ctx.isAdmin || isMaster(ctx.userId);
      if (!isAdmin) {
        return ctx.reply('🚫 Apenas administradores podem consultar feedbacks.');
      }
      if (sub === 'estatisticas') {
        const s = await stats();
        return ctx.reply(
          `📊 *Estatísticas de feedback*\n\n` +
          `Total de saídas: ${s.total}\n` +
          `Pendentes: ${s.pending}\n` +
          `Contatados: ${s.contacted}\n` +
          `Respondidos: ${s.responded}\n` +
          `Recusados: ${s.refused}\n` +
          `Expirados: ${s.expired}${groupTag(ctx)}`
        );
      }
      if (sub === 'grupo') {
        const gid = args[1];
        if (!gid) return ctx.reply('⚠️ Uso: `$feedback grupo <groupId>`');
        const rows = await listFeedback({ groupId: gid, limit: 20 });
        if (!rows.length) return ctx.reply('📭 Nenhum feedback para este grupo.');
        const lines = rows.map((r: any) =>
          `• ${r.display_name || r.user_id} — ${r.status}${r.response ? `: "${r.response.slice(0, 60)}"` : ''}`
        );
        return ctx.reply(`📋 *Feedbacks do grupo*\n\n${lines.join('\n')}${groupTag(ctx)}`);
      }
      const rows = await listFeedback({ limit: 20 });
      if (!rows.length) return ctx.reply('📭 Nenhum feedback registrado.');
      const lines = rows.map((r: any) =>
        `• ${r.display_name || r.user_id} — ${r.group_name || r.group_id} — ${r.status}${r.response ? `: "${r.response.slice(0, 60)}"` : ''}`
      );
      return ctx.reply(`📋 *Últimos feedbacks*\n\n${lines.join('\n')}${groupTag(ctx)}`);
    }

    // ─── Configuração (admin, grupo) ───
    if (!chat.isGroup) {
      return ctx.reply('⚠️ A configuração de feedback só pode ser feita em grupos.');
    }
    const isAdmin = ctx.isMaster || ctx.isAdmin || isMaster(ctx.userId);
    if (!isAdmin) {
      const member = findParticipant(chat, ctx.userId);
      if (!member || (!member.isAdmin && !member.isSuperAdmin)) {
        return ctx.reply('🚫 Apenas administradores podem configurar o feedback.');
      }
    }

    if (sub === 'on' || sub === 'off') {
      await setGroupModField(chat.id, 'feedback', sub === 'on');
      return ctx.reply(`✅ Feedback ${sub === 'on' ? 'ATIVADO' : 'DESATIVADO'} neste grupo${groupTag(ctx)}.`);
    }

    if (sub === 'status') {
      const { config } = await getGroupAutomationStatus(chat.id);
      const ativo = config.feedback === true;
      return ctx.reply(
        `${ativo ? '✅' : '⛔'} *Feedback:* ${ativo ? 'ATIVADO' : 'DESATIVADO'}\n\n` +
        `Quando alguém sair do grupo, o bot envia um pedido de feedback anônimo.${groupTag(ctx)}`
      );
    }

    return ctx.reply(
      `⚠️ Uso:\n` +
      `\`$feedback on|off\` — ativa/desativa\n` +
      `\`$feedback status\` — mostra o estado\n` +
      `\`$feedback lista\` — lista feedbacks\n` +
      `\`$feedback recentes\` — últimos\n` +
      `\`$feedback grupo <id>\` — filtra por grupo\n` +
      `\`$feedback estatisticas\` — contagens${groupTag(ctx)}`
    );
  }
};
