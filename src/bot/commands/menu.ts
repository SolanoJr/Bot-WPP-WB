import { ICommand } from './types';

export const menuCommand: ICommand = {
    name: 'menu',
    description: 'Exibe o menu principal do bot',
    async execute(msg, client, args) {
        // Cálculo de Uptime
        const uptimeSeconds = process.uptime();
        const hours = Math.floor(uptimeSeconds / 3600);
        const minutes = Math.floor((uptimeSeconds % 3600) / 60);
        const uptimeStr = `${hours}h ${minutes}m`;

        // Nível de Bateria
        let batteryStr = 'N/A';
        try {
            if (client && client.info) {
                if (typeof client.info.getBatteryStatus === 'function') {
                    const batteryData = await client.info.getBatteryStatus();
                    batteryStr = batteryData && batteryData.battery !== undefined ? `${batteryData.battery}%` : 'N/A';
                } else if (client.info.battery !== undefined) {
                    batteryStr = `${client.info.battery}%`;
                }
            }
        } catch (e) {}

        const menu = [
            "╔════════════════════════╗",
            "║          🤖 BOT         ║",
            "╠════════════════════════╣",
            `║ 🕒 Uptime: ${uptimeStr} | 🔋 Bat: ${batteryStr}`,
            "║",
            "║ 📝 Prefixos aceitos:",
            "║ ▸ $ ou !",
            "║",
            "║ 🛠️ **ADMIN**",
            "║ ▸ $stats / !stats - Estatísticas",
            "║ ▸ $banidos / !banidos - Lista de bans",
            "║ ▸ $grupos / !grupos - Gestão de chats",
            "║ ▸ $antispam / !antispam - Segurança",
            "║",
            "║ 👤 **USUÁRIO**",
            "║ ▸ $info - Sobre o bot",
            "║ ▸ $feedback - Sugestões",
            "║ ▸ $ping - Status conexão",
            "║",
            "║ 🧠 **INTELIGÊNCIA**",
            "║ ▸ $pergunta - Falar com IA",
            "║ ▸ $noticias - Top notícias",
            "║",
            "║ 🎮 **DIVERSÃO**",
            "║ ▸ $cantada - Conquista",
            "║ ▸ $conselho - Sabedoria",
            "║ ▸ $fakechat - Simulação",
            "║",
            "╚════════════════════════╝",
            "",
            "_Dica: Use $ajuda [comando] para detalhes._"
        ].join('\n');

        await msg.reply(menu);
    }
};
