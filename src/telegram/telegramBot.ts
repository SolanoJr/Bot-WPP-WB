import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';
import { processMessage } from '../services/messageHandler';
import { loadCommands } from '../bot/commands/index';
import { IBotMessage } from '../shared/types';

dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;
const telegramGroupId = process.env.TELEGRAM_GROUP_ID;

let telegramBotInstance: TelegramBot | null = null;

if (!token) {
    console.error('❌ [TELEGRAM] TELEGRAM_BOT_TOKEN não configurado no .env');
}

const getBotInstance = () => {
    if (!telegramBotInstance && token) {
        telegramBotInstance = new TelegramBot(token, { polling: true });
    }
    return telegramBotInstance;
};

const commands = loadCommands();

export const startTelegramBot = () => {
    const bot = getBotInstance();
    if (!bot) return;

    console.log('🚀 [TELEGRAM] Bot iniciado e aguardando mensagens...');

    bot.on('message', async (msg) => {
        if (!msg.text) return;

        console.log(`\n--- NOVA MENSAGEM TELEGRAM ---`);
        console.log(`De: ${msg.from?.first_name} (${msg.from?.id})`);
        console.log(`Conteúdo: ${msg.text}`);

        // Adaptador para interface universal
        const botMsg: IBotMessage = {
            id: msg.message_id.toString(),
            body: msg.text,
            from: msg.chat.id.toString(),
            author: msg.from?.id?.toString() || 'unknown',
            platform: 'telegram',
            isGroup: msg.chat.type === 'group' || msg.chat.type === 'supergroup',
            timestamp: msg.date,
            reply: async (text: string) => {
                return await bot.sendMessage(msg.chat.id, text, { reply_to_message_id: msg.message_id });
            },
            delete: async () => {
                return await bot.deleteMessage(msg.chat.id, msg.message_id);
            },
            raw: msg
        };

        // Só processa se começar com o prefixo $
        if (msg.text.startsWith('$')) {
            await processMessage(botMsg, bot, commands);
        }
    });

    return bot;
};

/**
 * Função para encaminhar mensagens para o Telegram (Relay)
 */
export const sendToTelegram = async (text: string, chatId?: string) => {
    const targetId = chatId || telegramGroupId;
    if (!targetId) return;

    const bot = telegramBotInstance || (token ? new TelegramBot(token) : null);
    if (!bot) return;

    try {
        await bot.sendMessage(targetId, text);
        console.log('✅ [TELEGRAM] Mensagem enviada via Relay.');
    } catch (error: any) {
        console.error('❌ [TELEGRAM] Erro no Relay:', error.message);
    }
};
