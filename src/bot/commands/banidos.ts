import { ICommand } from './types';
import axios from 'axios';
import { isMaster } from '../../services/permissions';

export const banidosCommand: ICommand = {
    name: 'banidos',
    description: 'Lista os usuários banidos registrados no sistema',
    async execute(msg, client, args) {
        const userId = msg.author || msg.from;
        if (!isMaster(userId)) {
            return msg.reply('❌ Apenas o MASTER pode consultar a lista global de banidos.');
        }

        try {
            const RELAY_URL = process.env.RELAY_URL || 'https://bot-wpp-relay.onrender.com';
            const response = await axios.get(`${RELAY_URL}/bans`, {
                headers: { 'x-api-key': process.env.API_KEY || '' },
                timeout: 10000
            });

            if (!response.data || response.data.length === 0) {
                return msg.reply('✅ Nenhum usuário banido encontrado no banco de dados.');
            }

            const bans = response.data;
            let list = '🚫 **LISTA DE BANIDOS (Últimos 10)**\n\n';
            
            bans.slice(-10).reverse().forEach((ban: any, index: number) => {
                const date = new Date(ban.banned_at || Date.now()).toLocaleDateString('pt-BR');
                list += `${index + 1}. 👤 @${ban.user_id.split('@')[0]}\n`;
                list += `   📅 Data: ${date}\n`;
                list += `   📝 Motivo: ${ban.reason || 'Não informado'}\n\n`;
            });

            await msg.reply(list);
        } catch (error) {
            console.error('❌ Erro ao buscar banidos:', error);
            await msg.reply('⚠️ Falha ao conectar com o banco de dados do Relay.');
        }
    }
};
