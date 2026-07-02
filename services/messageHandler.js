const { handleKeywords } = require('./keywordHandler');
const { handleModeration } = require('./moderationService');
const metricsService = require('../src/services/metricsService').default;

/**
 * Handler centralizado para todas as mensagens recebidas
 * @param {object} msg - Objeto da mensagem
 * @param {object} client - Instância do bot
 * @param {Map} commands - Mapa de comandos carregados
 */
async function processMessage(msg, client, commands) {
    const startTime = Date.now();
    
    // 1. Log de Auditoria
    console.log(`\n--- NOVA MENSAGEM ---`);
    console.log(`De (ID): ${msg.author || msg.from}`);
    console.log(`Conteúdo: ${msg.body}`);
    console.log(`---------------------\n`);

    // 📊 Registrar mensagem recebida
    try {
        metricsService.recordMessageReceived('whatsapp');
        metricsService.recordPlatformMessage('whatsapp', 'received');
    } catch (metricsError) {
        // Silencioso para não interromper fluxo
    }

    // 2. Auto-Moderação de Spam/Links/Apostas
    const moderated = await handleModeration(client, msg);
    if (moderated) {
        console.log(`🛡️ [MODERATION] Mensagem moderada: ${msg.body}`);
        return;
    }

    // 3. Lógica de Palavras-Chave e Auto-Moderação (Separada)
    const intercepted = await handleKeywords(msg, client);
    if (intercepted) return;

    // 4. Processamento de Comandos
    // Prefixo único: $ (comando customizado também usa $)
    const prefix = '$';

    if (!prefix) return;

    const body = msg.body || '';
    if (!body.startsWith(prefix)) return;

    const args = body.slice(prefix.length).trim().split(/ +/);
    const commandName = (args.shift() || '').toLowerCase();
    if (!commandName) return;
    const command = commands.get(commandName);

    if (command) {
        try {
            const cmdStart = Date.now();
            await command.execute(msg, client, args);
            
            // 📊 Registrar comando executado com sucesso
            try {
                metricsService.recordCommandExecuted(commandName, 'whatsapp');
                metricsService.recordCommandExecutionDuration(commandName, Date.now() - cmdStart);
            } catch (metricsError) {}
        } catch (error) {
            console.error(`❌ Erro no comando $${commandName}:`, error.message);
            await msg.reply('⚠️ Ocorreu um erro interno ao executar este comando.');
            
            // 📊 Registrar erro do comando
            try {
                metricsService.recordCommandError(commandName, error.name || 'unknown_error', 'whatsapp');
            } catch (metricsError) {}
        }
    } else {
        // Lógica de comandos customizados (fallback para Relay)
        await handleCustomCommands(msg, client, commandName);
    }
    
    // 📊 Registrar duração do processamento
    try {
        const duration = Date.now() - startTime;
        metricsService.recordMessageProcessingDuration('whatsapp', duration);
    } catch (metricsError) {}
}

/**
 * Fallback para comandos customizados salvos no Relay
 */
async function handleCustomCommands(msg, client, commandName) {
    try {
        const chat = await msg.getChat();
        if (chat.isGroup) {
            const axios = require('axios');
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

module.exports = {
    processMessage
};
