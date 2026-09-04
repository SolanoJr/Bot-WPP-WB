import { ICommand } from './types';
import { CommandContext } from '../../platforms/base/PlatformTypes';
import http from 'node:http';

function postJson(hostname: string, port: number, path: string, body: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const options = {
      hostname, port, path, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    };
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

export const screenCommand: ICommand = {
  name: 'screen',
  description: 'Criar sala de screen sharing',
  usage: '$screen [help|stop]',
  category: 'discord',
  cooldown: 5000,
  async execute(ctx: CommandContext): Promise<void> {
    const { msg, reply } = ctx;
    const args = ctx.args || [];
    const subcommand = args[0]?.toLowerCase() || 'start';
    const userName = msg?.userName || 'Usuario';

    if (subcommand === 'help' || subcommand === 'ajuda') {
      await reply(
        '🖥️ **Screen Sharing**\n\n' +
        '`$screen` - Criar sala e obter link\n' +
        '`$screen stop` - Parar\n' +
        '`$screen help` - Ajuda\n\n' +
        'Use Chrome/Edge para melhor resultado.'
      );
      return;
    }

    if (subcommand === 'stop' || subcommand === 'parar') {
      await reply('🛑 Feche a aba do navegador para parar.');
      return;
    }

    try {
      const screenPort = process.env.DISCORD_SCREEN_PORT || '3002';
      const baseUrl = process.env.DISCORD_SCREEN_PUBLIC_ORIGIN || `http://localhost:${screenPort}`;

      const guest = await postJson('127.0.0.1', parseInt(screenPort, 10), '/api/session-guest', { name: userName });
      if (!guest.identity) {
        await reply('❌ Erro ao criar sessão.');
        return;
      }

      // Sala da call: quem abre a atividade dentro dela cai direto na
      // transmissão, sem link. Só dá para descobrir a call em dois casos
      // exatos — nunca por chute de nome (parar na call errada vaza tela):
      // 1. comando veio do Discord: o próprio autor (ctx.userId = dc:<id>);
      // 2. comando veio de outra plataforma mas quem pediu é o dono: o id do
      //    Discord dele está no DISCORD_ADMIN_ID.
      let voice: { channelId: string; channelName: string } | null = null;
      let voiceMotivo = '';
      try {
        const pm = (globalThis as any).__platformManager;
        const dc = pm?.getAdapter?.('discord') as {
          findUserVoiceChannel?: (id: string) => Promise<{ channelId: string; channelName: string } | null>;
        } | undefined;
        if (!dc?.findUserVoiceChannel) {
          voiceMotivo = 'adapter discord indisponível';
        } else if (ctx.platform === 'discord' && ctx.userId) {
          voice = await dc.findUserVoiceChannel(ctx.userId);
          if (!voice) voiceMotivo = 'autor fora de call';
        } else if (ctx.isMaster && process.env.DISCORD_ADMIN_ID) {
          const adminId = process.env.DISCORD_ADMIN_ID.split(/[\s,;]+/).filter(Boolean)[0];
          if (adminId) voice = await dc.findUserVoiceChannel(adminId);
          if (!voice) voiceMotivo = 'dono fora de call';
        }
      } catch (err: any) {
        voice = null;
        voiceMotivo = `erro: ${err?.message ?? err}`;
      }
      console.log(`[ScreenCommand] call de voz: ${voice ? `#${voice.channelName} (${voice.channelId})` : `não achada (${voiceMotivo || 'sem motivo'})`} — plataforma=${ctx.platform} autor=${userName}`);

      if (voice) {
        const room = await postJson('127.0.0.1', parseInt(screenPort, 10), '/api/rooms/call-link', {
          identity: guest.identity,
          channelId: voice.channelId,
        });
        if (room.roomId) {
          const viewerLink = `${baseUrl}/share.html?t=${room.viewerToken}`;
          await reply(
            '🎮 **Screen Sharing** — call `' + voice.channelName + '`\n\n' +
            `🎥 **Transmitir:** ${room.shareUrl}\n\n` +
            `👥 **Assistir:** ${viewerLink}\n\n` +
            '💡 Quem abrir a atividade dentro dessa call já assiste direto, sem link. Chrome/Edge recomendado.'
          );
          return;
        }
      }

      const room = await postJson('127.0.0.1', parseInt(screenPort, 10), '/api/rooms/create', {
        identity: guest.identity,
        name: `Screen de ${userName}`,
        channelId: msg?.chatId?.replace('dc:', '') || ''
      });

      if (room.roomId) {
        const viewerLink = `${baseUrl}/share.html?t=${room.viewerToken}`;
        await reply(
          '🎮 **Screen Sharing**\n\n' +
          `🎥 **Transmitir:** ${room.shareUrl}\n\n` +
          `👥 **Assistir:** ${viewerLink}\n\n` +
          '💡 Entre numa call de voz e rode `$screen` no Discord para a atividade mostrar direto. Chrome/Edge recomendado.'
        );
      } else {
        await reply(`❌ Erro: ${JSON.stringify(room)}`);
      }
    } catch (error: any) {
      console.error('[ScreenCommand] Erro:', error);
      await reply(`❌ Erro: ${error.message}`);
    }
  }
};