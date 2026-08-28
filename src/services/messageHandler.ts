import { executeCommand, CommandContext } from './commandExecutor';
import { sendError } from './replyService';
import { recordCommandUsage } from './databaseService';
import { commandConfigService } from './commandConfigService';

/**
 * Executa um comando com contexto unificado (CommandContext).
 * Substitui o legado processMessage(msg, client, commands).
 */
export async function processCommand(ctx: CommandContext): Promise<void> {
  const commandName = ctx.commandName;
  const command = ctx.command;

  if (!command) {
    // Comando não encontrado — tenta comandos customizados via Relay
    await handleCustomCommand(ctx);
    return;
  }

  try {
    // Verifica se comando está habilitado no grupo
    const groupId = ctx.message?.chat?.id || ctx.message?.chatId || '';
    if (groupId) {
      const enabled = await commandConfigService.isEnabled(groupId, commandName);
      if (!enabled) {
        await ctx.reply(`⚠️ O comando \`${commandName}\` está desativado neste grupo.`);
        return;
      }
    }

    // Executa o comando
    await command.execute(ctx);
  } catch (error: any) {
    console.error(`❌ Erro no comando $${commandName}:`, error.message);
    await sendError(ctx, 'Erro ao executar comando');
  }
}

/**
 * Fallback para comandos customizados salvos no Relay.
 */
async function handleCustomCommand(ctx: CommandContext): Promise<void> {
  try {
    const chat = await ctx.message?.getChat?.();
    if (chat?.isGroup) {
      const groupId = chat.id._serialized;
      const RELAY_URL = process.env.RELAY_URL || 'https://bot-wpp-relay.onrender.com';

      const response = await executeCommand({
        message: ctx.message,
        chatId: groupId,
        userId: ctx.userId,
        platform: ctx.platform,
        reply: ctx.reply,
        args: ctx.args || [],
        commandName: ctx.commandName,
        command: ctx.command
      }).catch(() => null);

      if (response?.success) {
        // Comando customizado executado com sucesso
      }
    }
  } catch (error) {
    // Silencioso — fallback não é crítico
  }
}
