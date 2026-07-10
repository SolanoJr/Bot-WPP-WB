import { startBot as startWhatsAppBot } from '../whatsapp';
import { startTelegramBot } from '../telegram/telegramBot';
import { startDiscordBot } from '../discord/discordBot';

console.log('📡 [CORE] Iniciando sistemas híbridos (WhatsApp + Telegram + Discord)...');

// Iniciar Telegram (não bloqueante)
startTelegramBot();

// Iniciar Discord (não bloqueante)
startDiscordBot();

// Iniciar WhatsApp (contém lógica de polling/bloqueante no final)
startWhatsAppBot();
