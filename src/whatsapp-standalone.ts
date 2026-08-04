import qrcode from 'qrcode-terminal';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import dotenv from 'dotenv';

// Carregar .env explicitamente com caminho absoluto
// Usar __dirname para garantir que busca no diretório do projeto
const projectDir = path.resolve(__dirname, '..');
const envPath = path.join(projectDir, '.env');
if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    console.log('✅ [ENV] .env carregado de:', envPath);
    console.log('✅ [ENV] WARRIOR_AUTH_KEY:', process.env.WARRIOR_AUTH_KEY?.substring(0, 4) + '...' || 'NÃO DEFINIDO');
    console.log('✅ [ENV] MASTER_USER:', process.env.MASTER_USER || 'NÃO DEFINIDO');
} else {
    console.warn('⚠️ [ENV] .env não encontrado em:', envPath);
    console.warn('⚠️ [ENV] projectDir:', projectDir);
}

// 🚯 USAR SINGLETON GLOBAL - ÚNICO PONTO DE CRIAÇÃO DO CLIENT
import whatsappSingleton from './services/whatsappSingleton';

// Obter instância única de forma assíncrona
let client: any;
const WARRIOR_AUTH_KEY_LENGTH = 16;

const getWarriorAuthKeyOrExit = () => {
    const key = String(process.env.WARRIOR_AUTH_KEY || '').trim();

    if (key.length !== WARRIOR_AUTH_KEY_LENGTH) {
        console.warn(`⚠️ [BOT-CONFIG] WARRIOR_AUTH_KEY tem tamanho inesperado: ${key.length} (esperado ${WARRIOR_AUTH_KEY_LENGTH}).`);
        console.warn('⚠️ [BOT-CONFIG] Continuando mesmo assim para permitir conexão...');
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
    } catch (e: any) {
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
        } catch (authError: any) {
            if (authError.response && authError.response.status === 401) {
                console.error('⚠️  [PREFLIGHT] ERRO DE AUTENTICAÇÃO (401)!');
                console.error('🛑 A WARRIOR_AUTH_KEY do Bot não coincide com a do Relay.');
                console.warn('⚠️ [PREFLIGHT] Continuando mesmo assim para permitir conexão...');
                // process.exit(1); // REMOVIDO PARA PERMITIR INICIALIZAÇÃO SEM RELAY
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
    const authPath = path.join(projectDir, '.wwebjs_auth');
    console.log('📁 [PREFLIGHT] authPath:', authPath);
    if (!fs.existsSync(authPath)) {
        console.log('📁 [PREFLIGHT] Criando pasta de autenticação...');
        fs.mkdirSync(authPath, { recursive: true });
    } else {
        console.log('📁 [PREFLIGHT] Pasta de autenticação existe:', authPath);
    }
    console.log('✅ [PREFLIGHT] Sistema de arquivos OK');

    // -------- MASTER_USER --------
    console.log(`✅ [PREFLIGHT] MASTER configurado: ${process.env.MASTER_USER}`);

    console.log('🎉 [PREFLIGHT] Verificações concluídas (continua mesmo com falhas).');
    return true;
};

// Inicializar sistema com verificações críticas
const INIT_MAX_ATTEMPTS = 3;
const INIT_RETRY_DELAY_MS = 15_000;

export const startBot = async () => {
    console.log('🚀 [BOT] INICIANDO PROCESSO DE START (STANDALONE)...');

    preFlightCheck().catch(err => {
        console.error('❌❌❌ [ERRO CRÍTICO NO PREFLIGHT] ❌❌❌');
        console.error(err);
    });

    for (let attempt = 1; attempt <= INIT_MAX_ATTEMPTS; attempt++) {
        try {
            console.log(`⏳ [BOT] Tentativa de inicialização ${attempt}/${INIT_MAX_ATTEMPTS}...`);
            await initializeClient();
            console.log('✅ [BOT] initializeClient concluído!');

            await new Promise(() => {});
        } catch (error: any) {
            console.error(`🛑 [BOT] Falha na tentativa ${attempt}:`, error.message);

            if (attempt >= INIT_MAX_ATTEMPTS) {
                console.error('🛑 [BOT] Esgotadas todas as tentativas de inicialização.');
                process.exit(1);
            }

            console.log(`⏳ [BOT] Aguardando ${INIT_RETRY_DELAY_MS / 1000}s antes de tentar novamente...`);
            await new Promise(resolve => setTimeout(resolve, INIT_RETRY_DELAY_MS));
        }
    }
};

async function initializeClient() {
    // Obtém (ou cria) o cliente singleton
    client = await whatsappSingleton.getClient();
    console.log('✅ [WHATSAPP] Cliente obtido com sucesso');

    // Registro de eventos de mensagem - SEM COMANDOS para investigação
    client.on('message', async (msg: any) => {
        console.log(`[EVENTO] Mensagem recebida de ${msg.from}: ${msg.body.substring(0, 20)}...`);
        // SEM processMessage para evitar dependência circular
    });
    
    client.on('message_create', async (msg: any) => {
        if (msg.fromMe) {
            console.log(`[EVENTO] Mensagem enviada por mim para ${msg.to}: ${msg.body.substring(0, 20)}...`);
            // SEM processMessage para evitar dependência circular
        }
    });

    // Telemetria de ready
    client.on('ready', () => {
        console.log('🚀 [WHATSAPP] Bot está pronto e conectado');
    });

    // O initialize já é concluído dentro do singleton antes de retornar o client
    console.log('⏳ [WHATSAPP] Cliente inicializado, aguardando evento ready...');
}

// Inicializar
startBot().catch(error => {
    console.error('💥 Erro fatal na inicialização:', error);
    process.exit(1);
});
