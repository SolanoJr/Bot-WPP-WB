import { describe, expect, it, vi } from 'vitest';
import { loadCommands } from '../../src/bot/commands/index';

describe('runtime command registry', () => {
  it('registra os comandos anunciados no menu', () => {
    const commands = loadCommands();

    [
      'help',
      'menu',
      'ping',
      'alive',
      'stats',
      'antispam',
      'ban',
      'kick',
      'mute',
      'promover',
      'feedback',
      'ondeestou',
      'pergunta',
      'jogos',
      'forca',
      'velha',
      'sorteio',
      'piada',
      'conselho',
      'conselhob',
      'aleatoria',
      'votar',
      'voto',
      'delvoto',
      'clima',
      'nick',
      'gtts',
      'sendmsg',
      'addcmd'
    ].forEach((name) => {
      expect(commands.has(name), `${name} deveria estar registrado`).toBe(true);
    });
  });

  it('menu anuncia somente o prefixo $ e nao lista comandos inexistentes', async () => {
    const commands = loadCommands();
    const reply = vi.fn();

    await commands.get('menu')?.execute({ reply }, {}, []);

    const text = reply.mock.calls[0][0] as string;
    expect(text).toContain('║ ▸ $');
    expect(text).toContain('$ondeestou');
    expect(text).toContain('$jogos');
    expect(text).toContain('$pergunta');
    expect(text).not.toContain('!');
    expect(text).not.toContain('$banidos');
    expect(text).not.toContain('$grupos');
    expect(text).not.toContain('$noticias');
    expect(text).not.toContain('Bat:');
  });

  it('ondeestou gera link com parametros esperados', async () => {
    const commands = loadCommands();
    const reply = vi.fn();

    process.env.WARRIOR_AUTH_KEY = 'solano_wb_gps_26';
    await commands.get('ondeestou')?.execute({ from: '558581344211@c.us', reply }, {}, []);

    const text = reply.mock.calls[0][0] as string;
    expect(text).toContain('token=loc_');
    expect(text).toContain('chatId=558581344211%40c.us');
    expect(text).toContain('warriorKey=solano_wb_gps_26');
    expect(text).toContain('relay=https%3A%2F%2Fbot-wpp-relay.onrender.com');
  });
});
