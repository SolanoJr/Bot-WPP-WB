import { CommandContext, ICommand } from '../../platforms/base/PlatformTypes';
import { platformManager } from '../../platforms/PlatformManager';

/**
 * Comando de TESTE (temporário): $send <mensagem>
 * Envia a mensagem para o último chat visto em OUTRAS plataformas (Telegram/Discord).
 * Objetivo: validar a ponte de comunicação entre plataformas.
 */
export const sendCommand: ICommand = {
  name: 'send',
  description: 'Envia mensagem para outras plataformas (ponte cross-platform)',
  async execute(ctx: CommandContext) {
    const text = ctx.args.join(' ').trim();
    if (!text) {
      await ctx.reply('⚠️ Uso: $send <mensagem> — envia para o último chat do Telegram/Discord.');
      return;
    }

    const targets: string[] = [];
    // Envia para todas as plataformas exceto a atual
    for (const platform of platformManager.getActivePlatforms()) {
      if (platform === ctx.platform) continue;
      const chatId = platformManager.getLastChat(platform);
      if (!chatId) {
        targets.push(`⚠️ ${platform}: nenhum chat visto ainda`);
        continue;
      }
      try {
        const adapter = platformManager.getAdapter(platform);
        if (!adapter) {
          targets.push(`⚠️ ${platform}: adapter indisponível`);
          continue;
        }
        await adapter.client.sendMessage(chatId, `🔗 [ponte ${ctx.platform}] ${text}`);
        targets.push(`✅ ${platform}: ${chatId}`);
      } catch (e: any) {
        targets.push(`❌ ${platform}: ${e?.message || 'erro'}`);
      }
    }

    await ctx.reply(
      `📡 *Ponte cross-platform*\n` +
      targets.map((t) => `▸ ${t}`).join('\n')
    );
  }
};
