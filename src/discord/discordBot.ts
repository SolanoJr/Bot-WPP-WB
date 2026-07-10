import { Client, GatewayIntentBits, Message, TextChannel } from 'discord.js';
import dotenv from 'dotenv';
import { processMessage } from '../services/messageHandler';
import { loadCommands } from '../bot/commands/index';
import { IBotMessage } from '../shared/types';

dotenv.config();

const token = process.env.DISCORD_TOKEN;
let discordClientInstance: Client | null = null;

if (!token) {
    console.error('❌ [DISCORD] DISCORD_TOKEN não configurado no .env');
}

const getDiscordInstance = () => {
    if (!discordClientInstance && token) {
        discordClientInstance = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.DirectMessages,
            ],
        });
    }
    return discordClientInstance;
};

const commands = loadCommands();

export const startDiscordBot = () => {
    const client = getDiscordInstance();
    if (!client) return;

    client.once('ready', () => {
        console.log(`🚀 [DISCORD] Bot online como ${client.user?.tag}`);
    });

    client.on('messageCreate', async (msg: Message) => {
        if (msg.author.bot) return;

        // Adaptador para interface universal
        const botMsg: IBotMessage = {
            id: msg.id,
            body: msg.content,
            from: msg.channelId,
            author: msg.author.id,
            platform: 'discord',
            isGroup: !msg.guildId ? false : true,
            timestamp: msg.createdTimestamp,
            reply: async (text: string) => {
                return await msg.reply(text);
            },
            react: async (emoji: string) => {
                return await msg.react(emoji);
            },
            delete: async () => {
                if (msg.deletable) return await msg.delete();
            },
            raw: msg
        };

        // Só processa se começar com o prefixo $
        if (msg.content.startsWith('$')) {
            await processMessage(botMsg, client, commands);
        }
    });

    client.login(token).catch(err => {
        console.error('❌ [DISCORD] Falha no login:', err.message);
    });

    return client;
};

/**
 * Função para encaminhar mensagens para o Discord (Relay)
 */
export const sendToDiscord = async (channelId: string, text: string) => {
    const client = discordClientInstance;
    if (!client || !client.isReady()) return;

    try {
        const channel = await client.channels.fetch(channelId);
        if (channel && channel.isTextBased()) {
            await (channel as TextChannel).send(text);
            console.log('✅ [DISCORD] Mensagem enviada via Relay.');
        }
    } catch (error: any) {
        console.error('❌ [DISCORD] Erro no Relay:', error.message);
    }
};
