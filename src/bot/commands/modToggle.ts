// src/bot/commands/modToggle.ts
/**
 * Toggles independentes da moderação automática (AutoMod) por grupo.
 * Cada função tem seu próprio on/off, persistido em SQLite (group_mod).
 *
 * Comandos:
 *   $automod on|off            -> liga/desliga TUDO (mestre)
 *   $automod                   -> mostra o estado (on | off | personalizado)
 *   $antispam on|off           -> spam/cassino
 *   $antiestrangeiro on|off    -> DDI estrangeiro + 10 min
 *   $autolink on|off           -> antilink (apaga links)
 *   $bemvindo on|off           -> boas-vindas automáticas
 *   $detectar on|off           -> só avisa quando detecta (não remove)
 *   $remover on|off            -> remove + lista negra + bloqueia
 */
import { ICommand } from './types';
import { isMaster } from '../../services/permissions';
import { groupTag } from './format';
import {
  setGroupModField, setGroupModAll, getGroupMod, getGroupModState, GroupModConfig
} from '../../services/databaseService';

type Field = keyof GroupModConfig;

const ALIASES: Record<string, { field: Field; label: string }> = {
  automod: { field: 'antispam', label: 'AutoMod (mestre)' },
  antispam: { field: 'antispam', label: 'Anti-Spam' },
  antiestrangeiro: { field: 'antiestrangeiro', label: 'Anti-Estrangeiro' },
  autolink: { field: 'autolink', label: 'Anti-Link' },
  bemvindo: { field: 'bemvindo', label: 'Boas-Vindas' },
  detectar: { field: 'detectar', label: 'Detectar (avisar)' },
  remover: { field: 'remover', label: 'Remover (banir)' },
};

function statusLine(cfg: GroupModConfig): string {
  const lines = [
    `🛡️ *AutoMod — ${'estado'}`,
    ``,
    `🔘 Anti-Spam: ${cfg.antispam ? '✅' : '❌'}`,
    `🔘 Anti-Estrangeiro: ${cfg.antiestrangeiro ? '✅' : '❌'}`,
    `🔘 Anti-Link: ${cfg.autolink ? '✅' : '❌'}`,
    `🔘 Boas-Vindas: ${cfg.bemvindo ? '✅' : '❌'}`,
    `🔘 Detectar (avisar): ${cfg.detectar ? '✅' : '❌'}`,
    `🔘 Remover (banir): ${cfg.remover ? '✅' : '❌'}`,
  ];
  return lines.join('\n');
}

export function buildModToggle(name: string): ICommand {
  const alias = ALIASES[name];
  const isMasterToggle = name === 'automod';
  return {
    name,
    description: isMasterToggle
      ? 'Liga/desliga TODA a moderação automática (mestre). Use sem args p/ ver estado.'
      : `Ativa/desativa ${alias.label} no grupo. Uso: $${name} on|off`,
    async execute(ctx: any) {
      const args = ctx.args || [];
      const isAdmin = ctx.isMaster || ctx.isAdmin || isMaster(ctx.userId);
      if (!isAdmin) {
        return ctx.reply('🚫 Apenas administradores podem usar este comando.');
      }
      const chatId = ctx.chatId;
      if (!chatId || !String(chatId).endsWith('@g.us')) {
        return ctx.reply('⚠️ Este comando só funciona em grupos.');
      }

      // $automod sem args -> mostra estado
      if (isMasterToggle && args.length === 0) {
        const cfg = await getGroupMod(chatId);
        const state = await getGroupModState(chatId);
        const estadoTxt = state === 'on' ? '✅ TUDO LIGADO' : state === 'off' ? '❌ TUDO DESLIGADO' : '⚙️ PERSONALIZADO (misturado)';
        return ctx.reply(`${statusLine(cfg).replace('${estado}', estadoTxt)}\n\n${estadoTxt}${groupTag(ctx)}`);
      }

      const action = String(args[0] || '').toLowerCase();
      if (!['on', 'off'].includes(action)) {
        return ctx.reply(`⚠️ Uso: $${name} on|off` + (isMasterToggle ? ' (ou sem args p/ ver estado)' : ''));
      }
      const enable = action === 'on';

      if (isMasterToggle) {
        await setGroupModAll(chatId, {
          antispam: enable,
          antiestrangeiro: enable,
          autolink: enable,
          bemvindo: enable,
          detectar: enable,
          remover: enable,
        });
        return ctx.reply(`🛡️ AutoMod ${enable ? 'TODOS OS MÓDULOS ATIVADOS' : 'TODOS OS MÓDULOS DESATIVADOS'} neste grupo${groupTag(ctx)}.`);
      }

      await setGroupModField(chatId, alias.field, enable);
      return ctx.reply(`✅ ${alias.label} ${enable ? 'ATIVADO' : 'DESATIVADO'} neste grupo${groupTag(ctx)}.`);
    },
  };
}

export const automodCommand = buildModToggle('automod');
export const antispamModCommand = buildModToggle('antispam');
export const antiestrangeiroModCommand = buildModToggle('antiestrangeiro');
export const autolinkModCommand = buildModToggle('autolink');
export const bemvindoModCommand = buildModToggle('bemvindo');
export const detectarModCommand = buildModToggle('detectar');
export const removerModCommand = buildModToggle('remover');
