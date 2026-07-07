/**
 * 🔒 WarriorBlack - AutoMod Command
 * 
 * Comando para gerenciar o sistema de moderação automática
 */

import { ICommand } from "../../../platforms/base/PlatformTypes";
import { CommandContext } from "../../../platforms/base/PlatformTypes";
import { getAutoModConfig, updateAutoModConfig, ModConfig } from "../../services/autoModService";

export const automodCommand: ICommand = {
  name: "automod",
  description: "Gerencia o sistema de moderação automática",
  
  async execute(ctx: CommandContext) {
    // Verificar se é admin
    if (!ctx.isAdmin) {
      await ctx.reply("❌ Apenas administradores podem usar este comando.");
      return;
    }

    const args = ctx.args;
    const action = args[0]?.toLowerCase();

    if (!action) {
      // Mostrar status atual
      const config = getAutoModConfig();
      const status = formatAutoModStatus(config);
      await ctx.reply(status);
      return;
    }

    if (action === 'on' || action === 'enable') {
      updateAutoModConfig({ enabled: true });
      await ctx.reply("✅ AutoMod ativado com sucesso!");
      return;
    }

    if (action === 'off' || action === 'disable') {
      updateAutoModConfig({ enabled: false });
      await ctx.reply("❌ AutoMod desativado.");
      return;
    }

    // Toggle de funções específicas
    const toggleMap: Record<string, keyof ModConfig> = {
      'spam': 'autoKickSpam',
      'casino': 'autoKickCasino',
      'links': 'autoDeleteLinks',
      'interactive': 'filterInteractiveMessages',
      'foreign': 'filterForeignNumbers',
      'keywords': 'filterSuspiciousKeywords',
    };

    const configKey = toggleMap[action];
    if (configKey) {
      const currentConfig = getAutoModConfig();
      const newValue = !currentConfig[configKey];
      const updates: Partial<ModConfig> = {};
      updates[configKey] = newValue;
      updateAutoModConfig(updates);
      
      const statusEmoji = newValue ? '✅' : '❌';
      await ctx.reply(`${statusEmoji} Função ${action} ${newValue ? 'ativada' : 'desativada'}!`);
      return;
    }

    // Ajuda
    await ctx.reply(
      "🔒 *AutoMod - Sistema de Moderação Automática*\n\n" +
      "*Uso:*\n" +
      "`$automod` - Mostrar status atual\n" +
      "`$automod on/off` - Ativar/desativar AutoMod\n" +
      "`$automod spam` - Toggle filtro de spam\n" +
      "`$automod casino` - Toggle filtro de cassino\n" +
      "`$automod links` - Toggle filtro de links\n" +
      "`$automod interactive` - Toggle mensagens interativas\n" +
      "`$automod foreign` - Toggle números internacionais\n" +
      "`$automod keywords` - Toggle palavras-chave suspeitas"
    );
  }
};

function formatAutoModStatus(config: ModConfig): string {
  const formatToggle = (value: boolean, label: string) => {
    return `${value ? '✅' : '❌'} ${label}`;
  };

  return (
    "🔒 *AutoMod - Status Atual*\n\n" +
    `📊 *Geral:*\n` +
    `${formatToggle(config.enabled, 'AutoMod Ativo')}\n\n` +
    `🎯 *Filtros:*\n` +
    `${formatToggle(config.autoKickSpam, 'Spam')}\n` +
    `${formatToggle(config.autoKickCasino, 'Cassino/Apostas')}\n` +
    `${formatToggle(config.autoDeleteLinks, 'Links Suspeitos')}\n` +
    `${formatToggle(config.filterInteractiveMessages, 'Mensagens Interativas')}\n` +
    `${formatToggle(config.filterForeignNumbers, 'Números Internacionais')}\n` +
    `${formatToggle(config.filterSuspiciousKeywords, 'Palavras-Chave Suspeitas')}\n\n` +
    `*Use $automod <opção> para ativar/desativar*`
  );
}
