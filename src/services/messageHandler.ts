import axios from 'axios';
import { handleKeywords } from './keywordHandler';
import { processAutoMod } from './autoModService';

/**
 * Handler centralizado para todas as mensagens recebidas
 * @param msg - Objeto da mensagem
 * @param client - Instância do bot
 * @param commands - Mapa de comandos carregados
 */
async function processMessage(msg: any, client: any, commands: Map<string, any>): Promise<void> {
    // 1. Log de Auditoria
    console.log(`\n--- NOVA MENSAGEM ---`);
    console.log(`De (ID): ${msg.author || msg.from}`);
    console.log(`Conteúdo: ${msg.body}`);
    console.log(`---------------------\n`);

    // 2. Ignorar moderação e interceptação para comandos legítimos
    const body = msg.body || '';
    const prefix = '$';
    const isCommand = body.startsWith(prefix);

    if (!isCommand) {
        // 3. Auto-Moderação de Spam/Links/DDI (apenas para não-comandos)
        const moderated = await processAutoMod(msg, client);
        if (moderated) {
            return;
        }

        // 4. Lógica de Palavras-Chave e Auto-Moderação (Separada)
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
        } catch (error: any) {
            console.error(`❌ Erro no comando $${commandName}:`, error.message);
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

export {
    processMessage
};
