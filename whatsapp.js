const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config();

// 🚯 USAR SINGLETON GLOBAL - ÚNICO PONTO DE CRIAÇÃO DO CLIENT
const whatsappSingleton = require('./dist/services/whatsappSingleton');
const { isMaster } = require('./dist/services/permissions');
const { processMessage } = require('./dist/services/messageHandler');

// Importar carregador de comandos compilados (o bundle está em dist/bot/index.js)
const { loadCommands } = require(path.join(__dirname, './dist/bot/index.js'));

// Obter instância única de forma assíncrona
let client;

// Carregar comandos do TypeScript
const commands = loadCommands();
const WARRIOR_AUTH_KEY_LENGTH = 16;

const getWarriorAuthKeyOrExit = () => {
    const key = String(process.env.WARRIOR_AUTH_KEY || '').trim();

    if (key.length !== WARRIOR_AUTH_KEY_LENGTH) {
        console.error(`[BOT-CONFIG] WARRIOR_AUTH_KEY invalida: esperado exatamente ${WARRIOR_AUTH_KEY_LENGTH} caracteres, recebido ${key.length}.`);
        console.error('[BOT-CONFIG] Corrija a WARRIOR_AUTH_KEY no ambiente/.env antes de iniciar o Bot.');
        process.exit(1);
    }

    return key;
};

// 🔍 PREFLIGHT CHECK - Testa conexões críticas antes de iniciar
const preFlightCheck = async () => {
    console.log('🔍 [PREFLIGHT] Iniciando verificações críticas...');
    const warriorAuthKey = getWarriorAuthKeyOrExit();

    // Debug da chave
    const keyParts = warriorAuthKey.length >= 8
        ? `${warriorAuthKey.substring(0, 4)}...${warriorAuthKey.substring(warriorAuthKey.length - 4)}`
        : (warriorAuthKey ? 'CHAVE_PRESENTE_MAS_CURTA' : 'CHAVE_AUSENTE');
    console.log(`🔐 [PREFLIGHT] Debug de Chave Local: [${keyParts}] (Len: ${warriorAuthKey.length})`);

    const RELAY_URL = process.env.RELAY_URL || 'https://bot-wpp-relay.onrender.com';
    console.log(`🌐 [PREFLIGHT] Testando conexão com Relay: ${RELAY_URL}`);

    // -------- Health (não bloqueante) --------
    let healthOk = false;
    try {
        const healthResponse = await axios.get(`${RELAY_URL}/health`, {
            timeout: 5000,
            headers: { Accept: 'application/json' },
        });
        if (healthResponse.status === 200) {
            healthOk = true;
            console.log('✅ [PREFLIGHT] Relay Health OK - Status:', healthResponse.data.status);
        }
    } catch (e) {
        console.warn('⚠️ [PREFLIGHT] Falha ao checar health do Relay (continua).', e.message);
    }

    // -------- Autenticação (se health ok) --------
    if (healthOk) {
        try {
            await axios.get(`${RELAY_URL}/pending/auth_preflight_test`, {
                timeout: 5000,
                headers: { Accept: 'application/json', 'x-api-key': warriorAuthKey },
            });
            console.log('✅ [PREFLIGHT] Autenticação com Relay: OK');
        } catch (authError) {
            if (authError.response && authError.response.status === 401) {
                console.error('⚠️  [PREFLIGHT] ERRO DE AUTENTICAÇÃO (401)!');
                console.error('🛑 A WARRIOR_AUTH_KEY do Bot não coincide com a do Relay.');
                process.exit(1);
            } else {
                console.warn('⚠️ [PREFLIGHT] Falha ao validar Auth:', authError.message);
            }
        }
    }

    // -------- Variáveis de ambiente críticas --------
    const requiredVars = ['MASTER_USER', 'GEMINI_API_KEY'];
    const missingVars = requiredVars.filter(v => !process.env[v]);
    if (missingVars.length) {
        console.warn('⚠️ [PREFLIGHT] Variáveis críticas ausentes:', missingVars.join(', '));
    } else {
        console.log('✅ [PREFLIGHT] Variáveis de ambiente OK');
    }

    // -------- Sistema de arquivos --------
    const authPath = path.join(__dirname, '.wwebjs_auth');
    if (!fs.existsSync(authPath)) {
        console.log('📁 [PREFLIGHT] Criando pasta de autenticação...');
        fs.mkdirSync(authPath, { recursive: true });
    }
    console.log('✅ [PREFLIGHT] Sistema de arquivos OK');

    // -------- MASTER_USER --------
    console.log(`✅ [PREFLIGHT] MASTER configurado: ${process.env.MASTER_USER}`);

    console.log('🎉 [PREFLIGHT] Verificações concluídas (continua mesmo com falhas).');
    return true;
};

// 🔄 POLLING DO RELAY PARA LOCALIZAÇÕES PENDENTES
const startLocationPolling = () => {
    const RELAY_URL = 'https://bot-wpp-relay.onrender.com';
    const POLLING_INTERVAL = 15000; // 15 segundos (equilíbrio)
    const processedLocations = new Set(); // Evitar duplicação
    const pendingChatIds = new Set(); // Rastrear chatIds que esperam localização

    const checkPendingLocations = async () => {
        try {
            if (!client || !client.info) {
                return; // Client não está pronto
            }

            console.log(`🔍 [POLLING] Verificando localizações pendentes... (${pendingChatIds.size} chatIds)`);
            
            // Verificar cada chatId que está aguardando localização
            for (const chatId of pendingChatIds) {
                try {
                    const checkUrl = `${RELAY_URL}/pending/${encodeURIComponent(chatId)}`;
                    console.log(`🔍 [POLLING] Verificando localização para o ChatId: ${chatId}`);
                    
                    const response = await axios.get(checkUrl, {
                        timeout: 5000,
                        headers: { 
                            'Accept': 'application/json',
                            'x-api-key': getWarriorAuthKeyOrExit()
                        }
                    });

                    if (response.status === 204) {
                        continue; // Nenhuma localização para este chatId
                    }

                    const location = response.data;
                    
                    // 🔍 DEBUG: Mostrar estrutura real dos dados
                    console.log('📦 [DEBUG] Dados brutos do Relay:', JSON.stringify(location, null, 2));
                    
                    if (location && location.location) {
                        const locationId = `${location.chatId}_${location.timestamp}`;
                        
                        // Evitar processar a mesma localização múltiplas vezes
                        if (processedLocations.has(locationId)) {
                            continue;
                        }

                        processedLocations.add(locationId);

                        // Enviar resposta para o WhatsApp
                        await sendLocationResponse(location);
                        
                        // Remover chatId da lista de pendentes
                        pendingChatIds.delete(chatId);
                        console.log(`✅ [POLLING] ChatId ${chatId} removido dos pendentes`);
                    }

                } catch (error) {
                    if (error.response && error.response.status === 204) {
                        // Normal - sem localização para este chatId
                    } else {
                        console.log(`⚠️  [POLLING] Erro ao verificar ${chatId}: ${error.message}`);
                    }
                }
            }

        } catch (error) {
            console.log(`⚠️  [POLLING] Erro geral: ${error.message}`);
        }
    };

    const sendLocationResponse = async (location) => {
        try {
            const chatId = location.chatId;
            const loc = location.location; // Localização está aninhada
            
            // 🔍 DEBUG: Verificar estrutura da localização
            console.log('📦 [DEBUG] Estrutura de location:', JSON.stringify(loc, null, 2));
            
            // Tentar diferentes nomes de coordenadas e garantir que sejam Floats
            const rawLat = loc.lat || loc.latitude || loc.coords?.lat;
            const rawLon = loc.lng || loc.lon || loc.longitude || loc.coords?.lng || loc.coords?.lon;
            
            const lat = parseFloat(rawLat);
            const lon = parseFloat(rawLon);
            
            const timestamp = location.timestamp;
            
            console.log(`📍 [POLLING] Coordenadas extraídas (Float) - Lat: ${lat}, Lon: ${lon}`);

            // 🔒 FALLBACK: Verificar se coordenadas são válidas
            if (!lat || !lon || lat === 'undefined' || lon === 'undefined') {
                console.error(`❌ [POLLING] Coordenadas inválidas - Lat: ${lat}, Lon: ${lon}`);
                console.error(`❌ [POLLING] Dados completos recebidos:`, JSON.stringify(location, null, 2));
                return; // Não enviar mensagem com link quebrado
            }

            // Obter informações do contato e chat
            let contactInfo = '';
            let chatInfo = '';
            
            try {
                if (location.contactName) {
                    contactInfo = `👤 **Usuário:** ${location.contactName}\n`;
                }
                if (location.isGroup && location.groupName) {
                    chatInfo = `🏢 **Grupo:** ${location.groupName}\n`;
                } else if (!location.isGroup) {
                    chatInfo = `💬 **Chat:** Privado\n`;
                }
            } catch (error) {
                // Ignorar erros de extração de informações
            }

            // Formatar mensagem melhorada
            const response = [
                '📍 **LOCALIZAÇÃO RECEBIDA!**',
                '',
                contactInfo,
                chatInfo,
                `� **Data/Hora:** ${new Date(timestamp).toLocaleString('pt-BR')}`,
                '',
                '🗺️ **LOCALIZAÇÃO:**',
                `📍 Localização em tempo real`, // Preparado para Reverse Geocoding
                '',
                `� **Google Maps:**`,
                `🔗 https://www.google.com/maps?q=${lat},${lon}`,
                '',
                `� **Coordenadas:**`,
                `▸ Latitude: ${lat}`,
                `▸ Longitude: ${lon}`,
                '',
                `🆔 **Chat ID:** ${chatId}`
            ].join('\n');

            // Enviar mensagem
            await client.sendMessage(chatId, response);
            
            console.log(`✅ [POLLING] Localização enviada com sucesso para ${chatId}`);

        } catch (error) {
            console.error(`❌ [POLLING] Erro ao enviar localização: ${error.message}`);
        }
    };

    // Expor pendingChatIds globalmente para os comandos acessarem
    global.pendingChatIds = pendingChatIds;

    let isChecking = false;
    const scheduleNextCheck = async () => {
        if (isChecking) {
            console.log('⚠️  [POLLING] Verificação anterior ainda em andamento, pulando ciclo.');
            setTimeout(scheduleNextCheck, POLLING_INTERVAL);
            return;
        }

        isChecking = true;
        try {
            await checkPendingLocations();
        } catch (error) {
            console.error(`❌ [POLLING] Erro inesperado no ciclo: ${error.message}`);
        } finally {
            isChecking = false;
            setTimeout(scheduleNextCheck, POLLING_INTERVAL);
        }
    };

    // Iniciar polling
    console.log(`🔄 [POLLING] Iniciando verificação de localizações a cada ${POLLING_INTERVAL/1000}s`);
    scheduleNextCheck();
};

// Inicializar sistema com verificações críticas
const startBot = async () => {
    try {
        // 1. Executar verificações críticas
        await preFlightCheck();
        
        // 2. Inicializar client do WhatsApp
        await initializeClient();
        
        // 3. Iniciar polling quando client estiver pronto
        setTimeout(() => {
            startLocationPolling();
        }, 15000); // Aguardar 15s para garantir que client está pronto

        // Mantém o processo ativo indefinidamente. O polling (setInterval) já impede o exit,
        // mas ao final do fluxo assíncrono o Node pode encerrar antes que o intervalo seja
        // registrado. Esse await garante que o event loop continue vivo.
        await new Promise(() => {});
    } catch (error) {
        console.error('🛑 [BOT] Falha na inicialização:', error.message);
        process.exit(1);
    }
};

// ---------------------------------------------------------------------------
// Função responsável por obter a instância única do WhatsApp via singleton e
// conectar os handlers necessários (mensagens, telemetry etc.).
// Declarada como *function* para que seja hoisted e possa ser usada antes da
// sua definição no código (chamada dentro de `startBot`).
// ---------------------------------------------------------------------------
function initializeClient() {
    return (async () => {
        // Obtém (ou cria) o cliente singleton
        client = await whatsappSingleton.getClient();
        console.log('✅ [WHATSAPP] Cliente obtido com sucesso');

        // Registro de eventos de mensagem usando o handler centralizado
        client.on('message', async (msg) => {
            await processMessage(msg, client, commands);
        });

        // Telemetria de ready (mantida aqui para compatibilidade) – já está no
        // singleton, mas deixamos um log adicional
        client.on('ready', () => {
            console.log('🚀 [WHATSAPP] Bot está pronto e conectado');
        });

        // Inicializa a sessão do WhatsApp
        client.initialize();
    })();
}

// Exportar para uso no index.js
module.exports = { startBot };
