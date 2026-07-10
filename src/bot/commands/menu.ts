import { ICommand } from './types';

export const menuCommand: ICommand = {
    name: 'menu',
    description: 'Exibe o menu principal do bot',
    async execute(msg, client, args) {
        const uptimeSeconds = process.uptime();
        const hours = Math.floor(uptimeSeconds / 3600);
        const minutes = Math.floor((uptimeSeconds % 3600) / 60);
        const uptimeStr = `${hours}h ${minutes}m`;

        const menu = [
            "╔════════════════════════╗",
            "║          🤖 BOT         ║",
            "╠════════════════════════╣",
            `║ 🕒 Uptime: ${uptimeStr} | ✅ Online`,
            "║",
            "║ 📝 Prefixo aceito:",
            "║ ▸ $",
            "║",
            "║ 🛠️ ADMIN",
            "║ ▸ $stats - Estatísticas",
            "║ ▸ $antispam - Teste de limite",
            "║ ▸ $ban - Banir membro",
            "║ ▸ $kick - Remover membro",
            "║ ▸ $mute - Silenciar membro",
            "║ ▸ $promover - Tornar admin",
            "║",
            "║ 👤 USUÁRIO",
            "║ ▸ $ping - Status conexão",
            "║ ▸ $alive - Status do bot",
            "║ ▸ $help - Lista resumida",
            "║ ▸ $feedback - Sugestões",
            "║ ▸ $ondeestou - Enviar localização",
            "║",
            "║ 🧠 INTELIGÊNCIA",
            "║ ▸ $pergunta - Falar com IA (Gemini AI)",
            "║",
            "║ 🎮 JOGOS E DIVERSÃO",
            "║ ▸ $jogos - Lista de jogos",
            "║ ▸ $forca - Jogo da forca",
            "║ ▸ $velha - Jogo da velha",
            "║ ▸ $sorteio - Sorteio simples",
            "║ ▸ $piada - Piada aleatória",
            "║ ▸ $conselho - Conselho",
            "║ ▸ $aleatoria - Mensagem aleatória",
            "║ ▸ $votar / $voto / $delvoto",
            "║",
            "║ 🔧 UTILITÁRIOS",
            "║ ▸ $clima - Clima",
            "║ ▸ $nick - Apelido",
            "║ ▸ $gtts - Texto para voz",
            "║ ▸ $sendmsg - Enviar mensagem",
            "║ ▸ $addcmd - Comando customizado",
            "║",
            "╚════════════════════════╝",
            "",
            "_Dica: o bot aceita somente comandos iniciados com $_"
        ].join('\n');

        await msg.reply(menu);
    }
};
