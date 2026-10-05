import { ICommand } from './types';
import { CommandContext } from '../../platforms/base/PlatformTypes';
import { execSync } from 'child_process';
import { logInfo, logWarning } from '../../services/loggerService';

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
    //
    // REGRA: só exibir comandos que EXISTEM no registro (`commands` em index.ts).
    // Nomes seguem a nomenclatura oficial (Anti-Link, Anti-Cassino, Punição, Anúncio).
    const menu = [
      `🤖 *BOT WARRIORBLACK*`,
      `🕒 ${now}  •  ⏱️ ${uptimeStr}  •  📦 ${hash}`,
      ``,
      `🛡️ *AUTOMOD* _(admin)_`,
      `▸ $automod status · $antispam · $antilink · $antibot`,
      `▸ $anticassino · $antiestrangeiro · $punicao · $anuncio · $auditonly`,
      ``,
      `⚙️ *AUTOMAÇÕES* _(admin)_`,
      `▸ $bemvindo · $setwelcome · $apresentacao · $feedback · $sarcasmo`,
      ``,
      `👮 *ADMINISTRAÇÃO* _(admin)_`,
      `▸ $kick · $ban · $banidos · $mute · $desmute · $promover · $grupos · $admin`,
      ``,
      `👤 *USUÁRIO*`,
      `▸ $ping · $alive · $help · $feedback · $ondeestou · $apresentar`,
      ``,
      `🧠 *INTELIGÊNCIA*`,
      `▸ $pergunta (Gemini) · $fakechat · $cantada`,
      ``,
      `🎮 *JOGOS & DIVERSÃO*`,
      `▸ $jogos · $forca · $velha · $sorteio · $piada · $conselho · $aleatoria · $votar`,
      ``,
      `🔧 *UTILITÁRIOS*`,
      `▸ $clima · $nick · $gtts · $sendmsg · $addcmd · $stats · $info`,
      ``,
      `_Use $help para a lista completa e descrições._`,
    ].join('\n');

    // Enviar o menu e capturar a mensagem enviada (para reação ancorada)
    const sentMsg: any = await ctx.reply(menu);
    
    // Auto-reação: em modo laboratório, reagir com 🤖 na própria resposta
    // Em produção, NÃO reagir na resposta (evita reação dupla e confusão)
    const isLabMode = process.env.WPP_LAB_MODE === '1';
    if (isLabMode && ctx.client.react) {
      try {
        const reactionKey = sentMsg?.raw?.key || sentMsg?.key;
        const reactionId = sentMsg?.id || ctx.msg.id;
        if (reactionKey && reactionId) {
          logInfo(`[LabMode] Reação (🤖) na resposta do menu (key: ${reactionKey.id})`);
          await ctx.client.react(reactionId, '🤖', ctx.chatId, reactionKey);
        }
      } catch (e: any) {
        logWarning(`[LabMode] Erro ao reagir: ${e?.message}`);
      }
    }
  }
};
