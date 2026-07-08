import { ICommand } from './types';
import { CommandContext } from '../../../platforms/base/PlatformTypes';
import { execSync } from 'child_process';

export const menuCommand: ICommand = {
    name: 'menu',
    description: 'Exibe o menu principal do bot',
    async execute(ctx: CommandContext) {
        const uptimeSeconds = process.uptime();
        const hours = Math.floor(uptimeSeconds / 3600);
        const minutes = Math.floor((uptimeSeconds % 3600) / 60);
        const uptimeStr = `${hours}h ${minutes}m`;

        // Obter hora atual (HH:mm)
        const now = new Date();
        const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

        // Obter Hash do Git
        let gitHash = 'N/A';
        try {
            gitHash = execSync('git rev-parse --short HEAD').toString().trim();
        } catch (e) {
            console.error('Erro ao obter git hash:', e);
        }

        const { getAutoModConfig } = await import('../../services/autoModService');
        const amConfig = getAutoModConfig();
        
        const amStatus = amConfig.enabled ? '🛡️ ATIVO' : '⚪ OFF';
        const ddiStatus = amConfig.filterForeignNumbers ? 'ON' : 'OFF';
        const linkStatus = amConfig.autoDeleteLinks ? 'ON' : 'OFF';
        const keywordStatus = amConfig.filterSuspiciousKeywords ? 'ON' : 'OFF';
        
        // Sarcasmo e Card (Fixos como ON por enquanto, podem ser movidos para config depois)
        const sarcasmoStatus = 'ON';
        const cardStatus = 'ON';

        const menu = [
            `╔══════════════════════════╗`,
            `║    🤖 BOT      ||      ${timeStr}      `,
            `╠══════════════════════════╣`,
            `║       🕒 Uptime: ${uptimeStr}`,
            `║ ${amStatus}        | 😏 SARCASMO: ${sarcasmoStatus}`,
            `║ 🌍 DDI:      ${ddiStatus} | 📱 CARD:     ${cardStatus}`,
            `║ 🔍 PALAVRAS: ${keywordStatus} | 🔗 LINKS:    ${linkStatus}`,
            `║`,
            `║ 🛠️ ADMIN`,
            `║ ▸ $stats - Estatísticas`,
            `║ ▸ $antispam - Teste de limite`,
            `║ ▸ $ban - Banir membro`,
            `║ ▸ $kick - Remover membro`,
            `║ ▸ $mute - Silenciar membro`,
            `║ ▸ $promover - Tornar admin`,
            `║ ▸ $bemvindo - Config boas-vindas`,
            `║ ▸ $automod - Gerenciar AutoMod`,
            `║ ▸ $lista1del / $lista2del / $lista3del`,
            `║ ▸ $lista1edit / $lista2edit / $lista3edit`,
            `║`,
            `║ 👤 USUÁRIO`,
            `║ ▸ $ping - Status conexão`,
            `║ ▸ $alive - Status do bot`,
            `║ ▸ $help - Lista resumida`,
            `║ ▸ $feedback - Sugestões`,
            `║ ▸ $ondeestou - Enviar localização`,
            `║`,
            `║ 📋 LISTAS (por grupo)`,
            `║ ▸ $lista1 / $lista2 / $lista3`,
            `║ ▸ $lista1add / $lista2add / $lista3add`,
            `║`,
            `║ 🧠 INTELIGÊNCIA`,
            `║ ▸ $pergunta - Falar com IA (Gemini 2.5 Flash)`,
            `║`,
            `║ 🎮 JOGOS E DIVERSÃO`,
            `║ ▸ $jogos - Lista de jogos`,
            `║ ▸ $forca - Jogo da forca`,
            `║ ▸ $velha - Jogo da velha`,
            `║ ▸ $sorteio - Sorteio simples`,
            `║ ▸ $piada - Piada aleatória`,
            `║ ▸ $conselho - Conselho`,
            `║ ▸ $aleatoria - Mensagem aleatória`,
            `║ ▸ $votar / $voto / $delvoto`,
            `║`,
            `║ 🔧 UTILITÁRIOS`,
            `║ ▸ $clima - Clima`,
            `║ ▸ $nick - Apelido`,
            `║ ▸ $gtts - Texto para voz`,
            `║ ▸ $sendmsg - Enviar mensagem`,
            `║ ▸ $addcmd - Comando customizado`,
            `║ ▸ $cantada - Cantada aleatória`,
            `║`,
            `╠══════════════════════════╣`,
            `║ 📂 HASH: ${gitHash}`,
            `╚══════════════════════════╝`,
            ``,
            `_Dica: o bot aceita somente comandos iniciados com $_`
        ].join('\n');

        await ctx.reply(menu);
    }
};
