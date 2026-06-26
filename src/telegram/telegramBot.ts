import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';
dotenv.config();

class TelegramBotSingleton {
    private bot: TelegramBot | null = null;
    private token: string;

    constructor() {
        this.token = process.env.TELEGRAM_BOT_TOKEN || '';
    }

    public getBotInstance(): TelegramBot {
        if (this.bot) {
            return this.bot;
        }

        if (!this.token) {
            throw new Error('TELEGRAM_BOT_TOKEN não configurado no .env');
        }

        console.log('🤖 [TELEGRAM] Inicializando bot...');
        this.bot = new TelegramBot(this.token, { polling: true });

        this.bot.on('polling_error', (error) => {
            console.error(`❌ [TELEGRAM] Erro de polling: ${error.message}`);
        });

        console.log('✅ [TELEGRAM] Bot inicializado com sucesso');
        return this.bot;
    }
}

const telegramBotSingleton = new TelegramBotSingleton();
export default telegramBotSingleton;
