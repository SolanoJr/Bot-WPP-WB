import { sendError } from './replyService';
import { commandConfigService } from './commandConfigService';
import { recordCommandUsage } from './databaseService';

interface CommandContext {
    message: any;
    args: any[];
    [key: string]: any;
}

interface CommandResult {
    success: boolean;
    commandName: string;
    value: any;
    error: any;
}

const executeCommand = async (command: any, context: CommandContext): Promise<CommandResult> => {
    const commandName = command?.name || 'desconhecido';

    console.log(`Executando comando: ${commandName}`);

    try {
        // Check per‑group enable/disable before executing
        const groupId = context.message?.chat?.id || context.message?.chatId || '';
        if (groupId) {
            const enabled = await commandConfigService.isEnabled(groupId, commandName);
            if (!enabled) {
                // Notify user that command is disabled in this group
                if (typeof context.reply === 'function') {
                    await context.reply(`⚠️ O comando \`${commandName}\` está desativado neste grupo.`);
                } else if (typeof context.message?.reply === 'function') {
                    await context.message.reply(`⚠️ O comando \`${commandName}\` está desativado neste grupo.`);
                }
                return {
                    success: false,
                    commandName,
                    value: null,
                    error: new Error('Command disabled for group'),
                };
            }
        }

        const value = await command.execute(context.message, context.args, context);

        // Persistência real no SQLite (com nome do grupo) — fire-and-forget p/ não atrasar resposta
        const grpId = context.message?.chat?.id || context.message?.chatId || '';
        const grpName = context.message?.chat?.name || '';
        recordCommandUsage({
          commandName: command.name,
          userId: context.message.from,
          groupId: grpId,
          groupName: grpName,
        }).catch(() => {});

        console.log(`Comando executado com sucesso: ${commandName}`);

        return {
            success: true,
            commandName,
            value,
            error: null,
        };
    } catch (error: any) {
        console.error(`Erro ao executar comando ${commandName}:`, error);
        await sendError(context, 'Erro ao executar comando');

        return {
            success: false,
            commandName,
            value: null,
            error,
        };
    }
};

export {
    executeCommand,
};