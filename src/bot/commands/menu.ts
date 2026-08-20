import { ICommand } from './types';
import { CommandContext } from '../../platforms/base/PlatformTypes';
import { execSync } from 'child_process';

function getShortHash(): string {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: process.cwd() }).toString().trim();
  } catch {
    return 'local';
  }
}

export const menuCommand: ICommand = {
  name: 'menu',
  description: 'Exibe o menu principal do bot',
  async execute(ctx: CommandContext) {
    const uptimeSeconds = process.uptime();
    const hours = Math.floor(uptimeSeconds / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    const uptimeStr = `${hours}h ${minutes}m`;
    const now = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const hash = getShortHash();

    // Formato limpo p/ WhatsApp (sem bordas ASCII que desalexam no mobile).
    // Usa *negrito* (suportado pelo WA) e emojis de seção.
    const menu = [
      `🤖 *BOT WARRIORBLACK*`,
      `🕒 ${now}  •  ⏱️ ${uptimeStr}  •  📦 ${hash}`,
      ``,
      `🛡️ *ADMIN & MODERAÇÃO*`,
      `▸ $automod · $antispam · $antiestrangeiro · $antibotas · $antilink · $bemvindo · $detectar · $remover`,
      `▸ $kick · $ban · $mute · $banidos · $grupos`,
      ``,
      `👤 *USUÁRIO*`,
      `▸ $help · $feedback · $ondeestou`,
      ``,
      `📋 *LISTAS (por grupo)*`,
      `▸ $lista1 / $lista2 / $lista3 · $lista1add / $lista2add / $lista3add`,
      `▸ $lista1edit / $lista2edit / $lista3edit · $lista1del / $lista2del / $lista3del`,
      ``,
      `🧠 *INTELIGÊNCIA*`,
      `▸ $pergunta (Gemini) · $fakechat · $cantada`,
      ``,
      `🎮 *JOGOS & DIVERSÃO*`,
      `▸ $jogos · $forca · $velha · $piada · $conselho · $aleatoria`,
      ``,
      `🔧 *UTILITÁRIOS*`,
      `▸ $clima · $gtts`,
      ``,
      `_Use $help para a lista completa e descrições._`,
    ].join('\n');

    await ctx.reply(menu);
  }
};
