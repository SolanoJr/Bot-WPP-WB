import { describe, it, expect, vi } from 'vitest';
import { BaileysMessageSender } from '../../src/platforms/whatsapp/baileys/BaileysMessageSender';

vi.mock('../../src/services/loggerService', () => ({
  logInfo: vi.fn(), logWarning: vi.fn(), logError: vi.fn(),
}));

const GROUP = '120363410094452673@g.us';

function makeSender() {
  const sock: any = {
    // isSocketReady(): ws cliente + readyState OPEN (1). Mesmo insuficiente,
    // sendMessage só loga warning e segue.
    ws: { readyState: 1, socket: { readyState: 1 } },
    sendMessage: vi.fn(async () => ({ key: { id: 'MSGID' } })),
  };
  const sender = new BaileysMessageSender({
    sock, platform: 'whatsapp', userId: 'wpp:bot',
    getNumberId: vi.fn(async () => null),
    getContactById: vi.fn(async () => null),
  });
  return { sender, sock };
}

describe('BaileysMessageSender.sendMessage — mentions no payload', () => {
  it('options.mentions → content { text, mentions } (protocolo Baileys)', async () => {
    const { sender, sock } = makeSender();
    await sender.sendMessage(GROUP, 'Bem-vindo @5511 👋', { mentions: ['5511@c.us'] });

    const jid = sock.sendMessage.mock.calls[0][0];
    const content = sock.sendMessage.mock.calls[0][1];
    expect(jid).toBe(GROUP);
    expect(content).toEqual({ text: 'Bem-vindo @5511 👋', mentions: ['5511@c.us'] });
  });

  it('sem mentions → content sem o campo (não polui payload)', async () => {
    const { sender, sock } = makeSender();
    await sender.sendMessage(GROUP, 'simples');
    expect('mentions' in sock.sendMessage.mock.calls[0][1]).toBe(false);
  });

  it('mentions viajam junto com quoted (content), 3º arg só com quoted', async () => {
    const { sender, sock } = makeSender();
    const original = { key: { id: 'ORIG', remoteJid: GROUP, fromMe: true }, message: { conversation: 'x' } };
    await sender.sendMessage(GROUP, 'resposta com @5511', { mentions: ['5511@c.us'], originalRawMessage: original });

    const content = sock.sendMessage.mock.calls[0][1];
    expect(content.mentions).toEqual(['5511@c.us']);
    expect(content.quoted).toBeUndefined();                              // quoted sai do content
    expect(sock.sendMessage.mock.calls[0][2]).toEqual({ quoted: original }); // e viaja no 3º arg
  });
});
