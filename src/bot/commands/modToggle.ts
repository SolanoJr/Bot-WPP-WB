// src/bot/commands/modToggle.ts
/**
 * AutoMod — toggles das automações por grupo (persistidos em SQLite).
 *
 * CONFIGURAÇÃO CENTRALIZADA: todas as flags vivem em `group_mod` e são
 * consultáveis de forma consistente por `$automod status`.
 *
 * NOMENCLATURA OFICIAL (interface PT-BR) ↔ campo interno:
 *   Anti-Spam        ↔ antispam
 *   Anti-Link        ↔ autolink     (nome histórico mantido no banco)
 *   Anti-Bot         ↔ antibot
 *   Anti-Cassino     ↔ casino       (nome histórico mantido no banco)
 *   Anti-Estrangeiro ↔ antiestrangeiro
 *   Punição          ↔ remover
 *   Anúncio no grupo ↔ detectar
 *   Modo Auditoria   ↔ audit_only
 *   Boas-Vindas      ↔ bemvindo
 *   Apresentações    ↔ presentation_enabled
 *
 * Comandos (nomes oficiais primeiro, legados como alias):
 *   $automod status|on|off    → status geral / liga / desliga a MODERAÇÃO
 *   $antispam on|off
 *   $antilink on|off          (alias legado: $autolink)
 *   $antibot on|off
 *   $anticassino on|off       (alias legado: $casino)
 *   $antiestrangeiro on|off
 *   $punicao on|off           (alias legado: $remover)
 *   $anuncio on|off           (alias legado: $detectar)
 *   $auditonly on|off
 *   $bemvindo on|off          (SERVIÇO)
 *   $apresentacao on|off      (SERVIÇO)
 *
 * IMPORTANTE: `$automod on/off` controla apenas a MODERAÇÃO. Boas-Vindas e
 * Apresentações são serviços separados e NÃO são alterados por ele.
 */
import { ICommand } from './types';
import { isMaster } from '../../services/permissions';
import { groupTag } from './format';
import {
  setGroupModField, setGroupModAll, getGroupAutomationStatus, GroupModConfig
} from '../../services/databaseService';

type Field = keyof GroupModConfig;

/** Flags que `$automod on/off` controla (moderação apenas). */
const MODERATION_FLAGS: Field[] = [
  'antispam', 'antiestrangeiro', 'autolink', 'antibot', 'casino', 'remover', 'detectar',
];

/** Nome oficial (PT-BR) de cada flag + rótulo exibido. */
export const MOD_LABELS: Record<string, { field: Field; label: string }> = {
  antispam: { field: 'antispam', label: 'Anti-Spam' },
  antilink: { field: 'autolink', label: 'Anti-Link' },
  antibot: { field: 'antibot', label: 'Anti-Bot' },
  anticassino: { field: 'casino', label: 'Anti-Cassino' },
  antiestrangeiro: { field: 'antiestrangeiro', label: 'Anti-Estrangeiro' },
  punicao: { field: 'remover', label: 'Punição' },
  anuncio: { field: 'detectar', label: 'Anúncio no grupo' },
  auditonly: { field: 'audit_only', label: 'Modo Auditoria' },
  bemvindo: { field: 'bemvindo', label: 'Boas-Vindas' },
};

/**
 * Aliases LEGADOS → nome oficial.
 * Mantidos por compatibilidade; não criam comportamento novo.
 */
export const LEGACY_ALIASES: Record<string, string> = {
  autolink: 'antilink',
  casino: 'anticassino',
  remover: 'punicao',
  detectar: 'anuncio',
};

/** Resolve o nome oficial a partir de um nome (oficial ou legado). */
export function resolveModName(name: string): string | undefined {
  const n = String(name || '').toLowerCase();
  if (MOD_LABELS[n]) return n;
  const legacy = LEGACY_ALIASES[n];
  return legacy && MOD_LABELS[legacy] ? legacy : undefined;
}

const onOff = (v: any) => (v === true ? '✅' : '❌');

/**
 * Bloco de status do AutoMod.
 *
 * Estrutura: DETECTORES → AÇÕES/MODO → AUTOMAÇÕES.
 * Os nomes exibidos são os oficiais (PT-BR), independentes do campo interno.
 */
export function statusBlock(cfg: GroupModConfig, state: string): string {
  const estadoTxt =
    state === 'ativado' ? '✅ TUDO LIGADO'
    : state === 'desativado' ? '❌ TUDO DESLIGADO'
    : '⚙️ PERSONALIZADO';

  return [
    `🛡️ *AutoMod*`,
    ``,
    `*DETECTORES*`,
    `${onOff(cfg.antispam)} Anti-Spam`,
    `${onOff(cfg.autolink)} Anti-Link`,
    `${onOff(cfg.antibot)} Anti-Bot`,
    `${onOff(cfg.casino)} Anti-Cassino`,
    `${onOff(cfg.antiestrangeiro)} Anti-Estrangeiro`,
    ``,
    `*AÇÕES / MODO*`,
    `${onOff(cfg.remover)} Punição (banir/expulsar)`,
    `${onOff(cfg.detectar)} Anúncio no grupo`,
    `${onOff(cfg.audit_only)} Modo Auditoria (não executa ação)`,
    ``,
    `*AUTOMAÇÕES*`,
    `${onOff(cfg.bemvindo)} Boas-Vindas`,
    `${onOff(cfg.presentation_enabled)} Apresentações`,
    ``,
    `${estadoTxt}`,
  ].join('\n');
}

export function buildModToggle(name: string): ICommand {
  const isMasterToggle = name === 'automod';
  const alias = isMasterToggle ? undefined : MOD_LABELS[name];

  return {
    name,
    description: isMasterToggle
      ? 'AutoMod: status/controle da moderação automática do grupo.'
      : `Ativa/desativa ${alias?.label ?? name} no grupo. Uso: $${name} on|off`,
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

      // ─── $automod (sem args) ou $automod status → status geral ───
      const first = String(args[0] || '').toLowerCase();
      if (isMasterToggle && (args.length === 0 || first === 'status')) {
        const { config, state } = await getGroupAutomationStatus(chatId);
        return ctx.reply(`${statusBlock(config, state)}${groupTag(ctx)}`);
      }

      const action = first;
      if (!['on', 'off'].includes(action)) {
        return ctx.reply(
          `⚠️ Uso: $${name} on|off` +
          (isMasterToggle ? '\nPara ver o status: `$automod status`' : '')
        );
      }
      const enable = action === 'on';

      // ─── $automod on/off → apenas MODERAÇÃO (não mexe em serviços) ───
      if (isMasterToggle) {
        const patch: GroupModConfig = {};
        for (const f of MODERATION_FLAGS) (patch as any)[f] = enable;
        await setGroupModAll(chatId, patch);
        return ctx.reply(
          `🛡️ Moderação ${enable ? 'ATIVADA' : 'DESATIVADA'} neste grupo${groupTag(ctx)}.\n` +
          `_(Boas-Vindas e Apresentações não são alterados por este comando.)_`
        );
      }

      if (!alias) {
        return ctx.reply(`⚠️ Comando de moderação desconhecido: $${name}`);
      }

      await setGroupModField(chatId, alias.field, enable);
      return ctx.reply(`✅ ${alias.label} ${enable ? 'ATIVADO' : 'DESATIVADO'} neste grupo${groupTag(ctx)}.`);
    },
  };
}

// ─── Comandos ───────────────────────────────────────────────────────────────
export const automodCommand = buildModToggle('automod');
export const antispamModCommand = buildModToggle('antispam');
export const antiestrangeiroModCommand = buildModToggle('antiestrangeiro');
export const antilinkModCommand = buildModToggle('antilink');
export const antibotModCommand = buildModToggle('antibot');
export const anticassinoModCommand = buildModToggle('anticassino');
export const punicaoModCommand = buildModToggle('punicao');
export const anuncioModCommand = buildModToggle('anuncio');
export const auditonlyModCommand = buildModToggle('auditonly');
export const bemvindoModCommand = buildModToggle('bemvindo');

// ─── Aliases legados (mesma instância do comando oficial) ───────────────────
export const autolinkModCommand = antilinkModCommand;
export const casinoModCommand = anticassinoModCommand;
export const removerModCommand = punicaoModCommand;
export const detectarModCommand = anuncioModCommand;
