import { startBot } from '../whatsapp';
import { startTelegramBot } from '../telegram/telegramBot';

console.log('📡 [CORE] Iniciando sistemas híbridos (WhatsApp + Telegram)...');

// Iniciar Telegram primeiro (é instantâneo e não bloqueante)
startTelegramBot();

// Iniciar WhatsApp (contém lógica de espera/polling)
startBot();
