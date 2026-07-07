import { ICommand } from './types';
import { getAutoModConfig, updateAutoModConfig, ModConfig } from '../../services/autoModService';
import { isMaster } from '../../services/permissions';

export const automodCommand: ICommand = {
    name: 'automod',
    description: 'Gerencia as configurações de moderação automática',
    async execute(msg, client, args) {
        const senderId = msg.author || msg.from;
        
        // Apenas Master ou Admin do grupo pode alterar
        const chat = await msg.getChat();
        let isAdmin = false;
        if (chat.isGroup) {
            const participants = (chat as any).participants || [];
            const p = participants.find((part: any) => cleanId(part.id._serialized) === cleanId(senderId));
            isAdmin = p?.isAdmin || p?.isSuperAdmin;
        }

        if (!isMaster(senderId) && !isAdmin) {
            await msg.reply('❌ Apenas o Master ou Administradores podem alterar as configurações de AutoMod.');
            return;
        }

        const config = getAutoModConfig();

        if (args.length === 0) {
            const status = [
                '🛡️ *Configurações de AutoMod WarriorBlack:*',
                '',
                `${config.enabled ? '✅' : '❌'} Geral (enabled)`,
                `${config.filterForeignNumbers ? '✅' : '❌'} Filtro DDI (ddi)`,
                `${config.filterInteractiveMessages ? '✅' : '❌'} Filtro Interativo (interactive)`,
                `${config.filterSuspiciousKeywords ? '✅' : '❌'} Palavras-Chave (keywords)`,
                `${config.autoDeleteLinks ? '✅' : '❌'} Deletar Links (links)`,
                '',
                '_Use: $automod [tipo] [on/off]_',
                '_Ex: $automod ddi off_'
            ].join('\n');
            await msg.reply(status);
            return;
        }

        const type = args[0].toLowerCase();
        const action = args[1]?.toLowerCase();

        if (!['on', 'off'].includes(action)) {
            await msg.reply('❌ Use "on" para ativar ou "off" para desativar.');
            return;
        }

        const value = action === 'on';
        const updates: Partial<ModConfig> = {};

        const map: Record<string, keyof ModConfig> = {
            'geral': 'enabled',
            'enabled': 'enabled',
            'ddi': 'filterForeignNumbers',
            'interactive': 'filterInteractiveMessages',
            'interativo': 'filterInteractiveMessages',
            'keywords': 'filterSuspiciousKeywords',
            'palavras': 'filterSuspiciousKeywords',
            'links': 'autoDeleteLinks'
        };

        const key = map[type];
        if (!key) {
            await msg.reply('❌ Tipo inválido. Use: ddi, interactive, keywords, links ou geral.');
            return;
        }

        updates[key] = value as any;
        updateAutoModConfig(updates);

        await msg.reply(`✅ Filtro *${type}* definido como *${action.toUpperCase()}*.`);
    }
};

function cleanId(id: string) {
    return id.replace(/\D/g, '');
}
