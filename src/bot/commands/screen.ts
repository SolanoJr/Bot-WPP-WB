import { ICommand } from './types';
import { CommandContext } from '../types';

export const screenCommand: ICommand = {
  name: 'screen',
  aliases: ['screenshare', 'share'],
  description: 'Compartilhar tela no canal de voz do Discord',
  usage: '$screen [stop|help]',
  category: 'discord',
  cooldown: 5000,
  async execute(ctx: CommandContext): Promise<void> {
    const { client, message, args, reply } = ctx;
    const subcommand = args[0]?.toLowerCase() || 'start';
    
    // Verificar se é Discord
    if (message.platform !== 'discord') {
      await reply('❌ Este comando só funciona no Discord!');
      return;
    }
    
    const rawMsg = message.raw;
    if (!rawMsg?.member?.voice?.channelId) {
      await reply('❌ Você precisa estar em um **canal de voz** para usar o screen sharing!');
      return;
    }
    
    const voiceChannelId = rawMsg.member.voice.channelId;
    const guildId = rawMsg.guildId;
    const userId = rawMsg.author.id;
    const userName = rawMsg.author.username;
    
    // URL base do screen sharing (vem do .env)
    const baseUrl = process.env.DISCORD_SCREEN_PUBLIC_ORIGIN || 'http://100.101.218.16:3002';
    const clientId = process.env.DISCORD_CLIENT_ID || '1307158493907652648';
    
    if (subcommand === 'stop' || subcommand === 'parar') {
      await reply('🛑 Para parar: feche a aba do navegador ou saia do canal de voz.');
      return;
    }
    
    if (subcommand === 'help' || subcommand === 'ajuda') {
      await reply(
        `🖥️ **Screen Sharing - Comandos:**\n` +
        `\`$screen\` - Iniciar compartilhamento\n` +
        `\`$screen stop\` - Parar compartilhamento\n` +
        `\`$screen help\` - Esta ajuda\n\n` +
        `**Como funciona:**\n` +
        `1. Entre num canal de voz\n` +
        `2. Digite \`$screen\`\n` +
        `3. Clique no link que mando no seu **privado (DM)**\n` +
        `4. Autorize o app no Discord\n` +
        `5. Escolha o que compartilhar (tela/janela)\n` +
        `6. Pronto! Todos no canal de voz veem sua tela`
      );
      return;
    }
    
    // Criar URL de convite OAuth para o usuário
    const redirectUri = `${baseUrl}/auth/callback`;
    const state = Buffer.from(JSON.stringify({
      guildId,
      channelId: voiceChannelId,
      userId,
      userName,
      timestamp: Date.now()
    })).toString('base64url');
    
    const oauthUrl = 
      `https://discord.com/oauth2/authorize?` +
      `client_id=${clientId}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `response_type=code&` +
      `scope=identify%20voice%20rpc.activities.write&` +
      `state=${state}&` +
      `prompt=consent`;
    
    // Enviar no privado (DM)
    try {
      const dmChannel = await rawMsg.author.createDM();
      await dmChannel.send({
        content: 
          `🎮 **Screen Sharing - ${rawMsg.guild?.name || 'Servidor'}**\n\n` +
          `📢 Canal de voz: <#${voiceChannelId}>\n` +
          `👤 Você: ${userName}\n\n` +
          `🔗 **Clique aqui para começar:**\n${oauthUrl}\n\n` +
          `---\n` +
          `💡 **Dicas:**\n` +
          `• Use **Chrome/Edge** (Firefox pode bloquear)\n` +
          `• Permita "Compartilhar tela" quando o navegador pedir\n` +
          `• Escolha "Janela" para compartilhar só um app\n` +
          `• Feche a aba para parar`
      });
      
      // Reagir com like no comando original
      await rawMsg.react('👍');
      
    } catch (dmError) {
      console.error('[ScreenCommand] Erro ao enviar DM:', dmError);
      await reply(
        `❌ **Não consegui te mandar mensagem privada!**\n\n` +
        `Verifique se:\n` +
        `• Suas **DMs estão abertas** (Configurações > Privacidade > Permitir DMs de membros do servidor)\n` +
        `• Você não me bloqueou\n\n` +
        `Ou use este link direto:\n${oauthUrl}`
      );
    }
  }
};