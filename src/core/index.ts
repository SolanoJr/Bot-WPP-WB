import { startBot as startWhatsAppBot } from '../whatsapp';
import telegramBotSingleton from '../telegram/telegramBot';
import { processMessage } from '../services/messageHandler';
import { loadCommands } from '../bot/commands/index';

const commands = loadCommands();

async function startBots() {
    console.log('🚀 [CORE] Iniciando sistema híbrido...');

    // 1. Iniciar Telegram
    try {
        const telegramBot = telegramBotSingleton.getBotInstance();

        telegramBot.on('message', async (msg) => {
            if (!msg.text) return;

            // Adaptador simples para o messageHandler entender como uma "mensagem"
            const adaptedMsg = {
                body: msg.text,
                from: msg.chat.id.toString(),
                author: msg.from?.id.toString(),
                reply: async (text: string) => {
                    await telegramBot.sendMessage(msg.chat.id, text);
                },
                getChat: async () => ({
                    isGroup: msg.chat.type === 'group' || msg.chat.type === 'supergroup',
                    id: { _serialized: msg.chat.id.toString() }
                }),
                _raw: msg // Referência original se precisar
            };

            await processMessage(adaptedMsg, telegramBot, commands);
        });

        console.log('✅ [CORE] Telegram bot configurado');
    } catch (error: any) {
        console.error(`❌ [CORE] Falha ao iniciar Telegram: ${error.message}`);
    }

    // 2. Iniciar WhatsApp
    try {
        await startWhatsAppBot();
        console.log('✅ [CORE] WhatsApp bot iniciado');
    } catch (error: any) {
        console.error(`❌ [CORE] Falha ao iniciar WhatsApp: ${error.message}`);
    }
}

startBots();
