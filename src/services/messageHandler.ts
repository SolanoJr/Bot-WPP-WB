import axios from 'axios';
import { handleKeywords } from './keywordHandler';
import { handleModeration } from './moderationService';
import { IBotMessage } from '../shared/types';
import { getDb } from './databaseService';
import logger from './loggerService';

/**
 * Handler centralizado para todas as mensagens recebidas (Multiplataforma)
 * @param msg - Objeto da mensagem (Adaptado para IBotMessage se necessário)
 * @param client - Instância do bot da plataforma
 * @param commands - Mapa de comandos carregados
 */
async function processMessage(msg: any, client: any, commands: Map<string, any>): Promise<void> {
    // Normalização para Interface Universal se necessário
    const isUniversal = (msg as IBotMessage).platform !== undefined;
    const body = msg.body || '';
    const authorId = msg.author || msg.from;
    const platform = isUniversal ? (msg as IBotMessage).platform : 'whatsapp';

    // 1. Log de Auditoria
    console.log(`\n--- NOVA MENSAGEM [${platform.toUpperCase()}] ---`);
    console.log(`De (ID): ${authorId}`);
    console.log(`Conteúdo: ${body}`);
    console.log(`---------------------\n`);

    // 2. Ignorar moderação e interceptação para comandos legítimos
    const prefix = '$';
    const isCommand = body.startsWith(prefix);

    if (!isCommand) {
        // 3. Auto-Moderação (Apenas WhatsApp por enquanto, ou expandir para outros)
        if (platform === 'whatsapp') {
            const moderated = await handleModeration(client, msg);
            if (moderated) {
                console.log(`🛡️ [MODERATION] Mensagem moderada no WhatsApp: ${body}`);
                return;
            }
        }

        // 4. Lógica de Palavras-Chave
        const intercepted = await handleKeywords(msg, client);
        if (intercepted) return;
    }

    // 5. Processamento de Comandos
    if (!isCommand) return;

    const args = body.slice(prefix.length).trim().split(/ +/);
    const commandName = (args.shift() || '').toLowerCase();
    if (!commandName) return;
    const command = commands.get(commandName);

    if (command) {
        try {
            await command.execute(msg, client, args);
            await logCommand(commandName, authorId, msg.from, platform, true);
        } catch (error: any) {
            const errorMsg = error.message || 'Erro desconhecido';
            console.error(`❌ Erro no comando $${commandName}:`, errorMsg);
            await logCommand(commandName, authorId, msg.from, platform, false, errorMsg);
            await msg.reply('⚠️ Ocorreu um erro interno ao executar este comando.');
        }
    } else {
        // Lógica de comandos customizados (fallback para Relay)
        await handleCustomCommands(msg, client, commandName);
    }
}

/**
 * Fallback para comandos customizados salvos no Relay
 */
async function handleCustomCommands(msg: any, client: any, commandName: string): Promise<void> {
    try {
        const chat = await msg.getChat();
        if (chat.isGroup) {
            const groupId = chat.id._serialized;
            const RELAY_URL = process.env.RELAY_URL || 'https://bot-wpp-relay.onrender.com';
            
            const response = await axios.get(`${RELAY_URL}/groups/${encodeURIComponent(groupId)}/config`, {
                headers: { 'x-api-key': process.env.WARRIOR_AUTH_KEY || '' },
                timeout: 5000
            });
            
            if (response.data.success && response.data.customCommands) {
                const customCommands = response.data.customCommands;
                if (customCommands[commandName]) {
                    await msg.reply(customCommands[commandName]);
                }
            }
        }
    } catch (error) {
        // Silencioso
    }
}

/**
 * 📝 Log centralizado de comandos (SQLite + Winston)
 */
async function logCommand(
    name: string,
    userId: string,
    groupId: string,
    platform: string,
    success: boolean,
    error?: string
) {
    try {
        const db = await getDb();
        await db.run(
            'INSERT INTO command_logs (command_name, user_id, group_id, platform, success, error_message) VALUES (?, ?, ?, ?, ?, ?)',
            [name, userId, groupId, platform, success ? 1 : 0, error || null]
        );

        const logMsg = `[COMMAND] ${platform.toUpperCase()} | ${name} | User: ${userId} | Success: ${success}${error ? ' | Error: ' + error : ''}`;
        if (success) logger.info(logMsg);
        else logger.error(logMsg);

    } catch (err) {
        console.error('❌ Erro ao gravar log de comando:', err);
    }
}

export {
    processMessage
};
