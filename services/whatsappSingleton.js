/**
 * 🚯 SINGLETON GLOBAL DO WHATSAPP CLIENT
 * 
 * GARANTE APENAS UMA INSTÂNCIA DO CLIENT EM TODO O SISTEMA
 * Impede múltiplas execuções e conflitos de Puppeteer
 */

const { Client, LocalAuth } = require('whatsapp-web.js');
const fs = require('fs');
const path = require('path');

class WhatsAppSingleton {
    constructor() {
        this.client = null;
        this.isInitialized = false;
        this.lockFile = path.join(__dirname, '..', '.whatsapp-instance.lock');
        this.instanceId = `instance_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // � Limpar processos Chrome zumbis
    async cleanupOrphanedProcesses() {
        const { execSync } = require('child_process');
        const isWindows = process.platform === 'win32';

        try {
            console.log(`🧹 [SINGLETON] Limpando processos Chrome zumbis...`);

            if (isWindows) {
                try {
                    execSync('taskkill /F /IM chrome.exe /T', { timeout: 10000 });
                } catch (_error) {
                    // Ignorar se não existir chrome.exe
                }
                try {
                    execSync('taskkill /F /IM msedge.exe /T', { timeout: 10000 });
                } catch (_error) {
                    // Ignorar se não existir msedge.exe
                }
            } else {
                try {
                    execSync('pkill -9 -f chrome', { timeout: 5000 });
                } catch (_error) {
                    // Ignorar se nenhum processo encontrado
                }
                try {
                    execSync('pkill -9 -f puppeteer', { timeout: 5000 });
                } catch (_error) {
                    // Ignorar se nenhum processo encontrado
                }
            }

            // Pequena pausa para garantir limpeza
            await new Promise(resolve => setTimeout(resolve, 1000));

            console.log(`✅ [SINGLETON] Limpeza concluída`);

        } catch (error) {
            console.log(`⚠️  [SINGLETON] Erro na limpeza: ${error.message}`);
        }
    }

    // � Verificar se já existe instância rodando
    checkExistingInstance() {
        try {
            if (fs.existsSync(this.lockFile)) {
                const lockData = JSON.parse(fs.readFileSync(this.lockFile, 'utf8'));
                
                // Verificar se o processo ainda está vivo
                try {
                    process.kill(lockData.pid, 0); // Signal 0 = apenas verifica se existe
                    console.log(`🚫 [SINGLETON] Instância já rodando: PID ${lockData.pid}`);
                    console.log(`🚫 [SINGLETON] Instance ID: ${lockData.instanceId}`);
                    console.log(`🚫 [SINGLETON] Iniciada em: ${lockData.startTime}`);
                    return true; // Instância existe
                } catch (error) {
                    // Processo não existe mais, limpar lock
                    console.log(`🧹 [SINGLETON] Limpando lock de processo morto: PID ${lockData.pid}`);
                    fs.unlinkSync(this.lockFile);
                    return false;
                }
            }
            return false;
        } catch (error) {
            console.log(`⚠️  [SINGLETON] Erro ao verificar lock: ${error.message}`);
            return false;
        }
    }

    // 🔒 Criar lock file
    createLock() {
        try {
            const lockData = {
                pid: process.pid,
                instanceId: this.instanceId,
                startTime: new Date().toISOString(),
                nodeVersion: process.version,
                platform: process.platform
            };
            
            fs.writeFileSync(this.lockFile, JSON.stringify(lockData, null, 2), 'utf8');
            console.log(`🔒 [SINGLETON] Lock criado: PID ${process.pid}`);
            console.log(`🔒 [SINGLETON] Instance ID: ${this.instanceId}`);
            
            // Setup cleanup ao sair
            process.on('SIGINT', () => this.cleanup());
            process.on('SIGTERM', () => this.cleanup());
            process.on('exit', () => this.cleanup());
            
            return true;
        } catch (error) {
            console.error(`❌ [SINGLETON] Erro ao criar lock: ${error.message}`);
            return false;
        }
    }

    // 🧹 Limpar lock file
    cleanup() {
        try {
            if (fs.existsSync(this.lockFile)) {
                const lockData = JSON.parse(fs.readFileSync(this.lockFile, 'utf8'));
                if (lockData.pid === process.pid) {
                    fs.unlinkSync(this.lockFile);
                    console.log(`🧹 [SINGLETON] Lock removido: PID ${process.pid}`);
                }
            }
        } catch (error) {
            console.error(`❌ [SINGLETON] Erro ao limpar lock: ${error.message}`);
        }
    }

    // 🚯 Obter instância única do Client
    async getClient() {
        if (this.client && this.isInitialized) {
            console.log(`✅ [SINGLETON] Retornando client existente: ${this.instanceId}`);
            return this.client;
        }

        // Verificar se já existe instância rodando
        if (this.checkExistingInstance()) {
            throw new Error(`WhatsApp Client já está rodando em outro processo. Verifique o lock file: ${this.lockFile}`);
        }

        // Limpar processos Chrome zumbis
        await this.cleanupOrphanedProcesses();

        // Criar lock
        if (!this.createLock()) {
            throw new Error('Não foi possível criar lock de instância');
        }

        console.log(`🆕 [SINGLETON] Criando NOVA instância: ${this.instanceId}`);
        
        // Criar client COM CONFIGURAÇÃO ÚNICA
        this.client = new Client({
            authStrategy: new LocalAuth({
                clientId: 'bot-wpp-session' // ÚNICO clientId em todo sistema
            }),
            puppeteer: {
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--single-process',
                    '--no-zygote',
                    '--disable-gpu',
                    '--disable-web-security',
                    '--disable-features=VizDisplayCompositor'
                ],
            },
            restartOnAuthFail: true
        });

        // Configurar eventos de logging
        this.setupLogging();
        
        this.isInitialized = true;
        
        console.log(`✅ [SINGLETON] Client criado com sucesso: ${this.instanceId}`);
        return this.client;
    }

    // 📝 Configurar logging detalhado
    setupLogging() {
        this.client.on('qr', (qr) => {
            const fs = require('fs');
            const path = require('path');
            const qrcodeTerminal = require('qrcode-terminal');
            
            console.log(`📱 [SINGLETON-${this.instanceId}] QR Code gerado`);
            console.log(`📱 [SINGLETON-${this.instanceId}] Escaneie com seu WhatsApp`);
            
            // Exibir QR no terminal
            qrcodeTerminal.generate(qr, { small: true });
            
            // Salvar QR em arquivo para download
            try {
                const logsDir = path.join(__dirname, '../scripts/logs');
                if (!fs.existsSync(logsDir)) {
                    fs.mkdirSync(logsDir, { recursive: true });
                }
                const qrFile = path.join(logsDir, 'last-qr.txt');
                fs.writeFileSync(qrFile, qr);
                console.log(`📄 [SINGLETON-${this.instanceId}] QR salvo em: ${qrFile}`);
            } catch (err) {
                console.log(`⚠️  [SINGLETON-${this.instanceId}] Erro ao salvar QR: ${err.message}`);
            }
        });

        this.client.on('authenticated', () => {
            console.log(`✅ [SINGLETON-${this.instanceId}] Sessão autenticada com sucesso!`);
        });

        this.client.on('auth_failure', (msg) => {
            console.log(`❌ [SINGLETON-${this.instanceId}] FALHA NA AUTENTICAÇÃO: ${msg}`);
        });

        this.client.on('disconnected', (reason) => {
            console.log(`📱 [SINGLETON-${this.instanceId}] BOT DESCONECTADO!`);
            console.log(`🔍 [SINGLETON-${this.instanceId}] Motivo: ${reason}`);
            console.log(`📊 [SINGLETON-${this.instanceId}] Timestamp: ${new Date().toISOString()}`);
            
            if (reason === 'LOGOUT' || reason === 'CONFLICT') {
                console.log(`⚠️  [SINGLETON-${this.instanceId}] Sessão perdida - necessário QR`);
            } else {
                console.log(`🔄 [SINGLETON-${this.instanceId}] Tentando reconectar em 10s...`);
                setTimeout(() => {
                    if (this.client) {
                        this.client.initialize();
                    }
                }, 10000);
            }
        });

        this.client.on('ready', () => {
            console.log(`🚀 [SINGLETON-${this.instanceId}] Bot Online!`);
            console.log(`📱 [SINGLETON-${this.instanceId}] Cliente: ${this.client.info?.wid?.user || 'unknown'}`);
            console.log(`🔋 [SINGLETON-${this.instanceId}] Bateria: ${this.client.info?.battery || 'unknown'}%`);
            console.log(`📊 [SINGLETON-${this.instanceId}] Ready em: ${new Date().toISOString()}`);
        });
    }

    // 🔄 Reiniciar client (usando mesma instância)
    async restart() {
        if (!this.client) {
            throw new Error('Nenhum client para reiniciar');
        }
        
        console.log(`🔄 [SINGLETON] Reiniciando client: ${this.instanceId}`);
        
        try {
            // Destruir e recriar mantendo singleton
            await this.client.destroy();
            this.isInitialized = false;
            
            // Pequeno delay para limpeza
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            return this.getClient();
        } catch (error) {
            console.error(`❌ [SINGLETON] Erro ao reiniciar: ${error.message}`);
            throw error;
        }
    }

    // 📊 Status da instância
    getStatus() {
        return {
            instanceId: this.instanceId,
            isInitialized: this.isInitialized,
            hasClient: !!this.client,
            lockFile: this.lockFile,
            pid: process.pid
        };
    }
}

// Exportar singleton global
const whatsappSingleton = new WhatsAppSingleton();
module.exports = whatsappSingleton;
