import { describe, it, expect, vi } from 'vitest';

/**
 * Teste do envio de sarcasmo (Rodada 4c).
 *
 * Por que existe: o bug era `sock.sendMessage(jid, SARCASMO_TEXT)` — string
 * crua. O Baileys lança "Cannot use 'in' operator to search for 'image' in ..."
 * e o `.catch(() => {})` engolia. Resultado: sarcasmo nunca disparou em
 * produção, sem log e sem mensagem. Este teste trava exatamente isso: assere
 * que o segundo argumento é um OBJETO `{ text }`, nunca string.
 *
 * `dispatchMessage` importa serviços por caminho dinâmico — daí os mocks.
 */

vi.mock('../../src/services/databaseService.js', () => ({
  getGroupMod: vi.fn(async () => ({
    antispam: false, antiestrangeiro: false, autolink: false, bemvindo: false,
    detectar: false, remover: false, audit_only: false, antibot: false,
    casino: false, presentation_enabled: false, feedback: false,
    sarcasmo: true,
  })),
}));

vi.mock('../../src/services/captureStore.js', () => ({
  appendCapture: vi.fn(),
}));

vi.mock('../../src/services/presentationService.js', () => ({
  isCommunity085Group: vi.fn(async () => false),
  getOrCreateSession: vi.fn(),
  getActiveSession: vi.fn(),
  collectMessage: vi.fn(),
  DEFAULT_IDLE_MS: 0,
}));

import { getGroupMod } from '../../src/services/databaseService';
import { BaileysMessageNormalizer } from '../../src/platforms/whatsapp/baileys/BaileysMessageNormalizer';

const GROUP = '120363410094452673@g.us';
const USER = '5511999999999@c.us';
const BOT_ID = '558581344211:81@s.whatsapp.net';

function makeNormalizer(sock: any): BaileysMessageNormalizer {
  return new BaileysMessageNormalizer({
    sock,
    platform: 'whatsapp',
    userId: BOT_ID,
    getChat: vi.fn(async () => ({ isGroup: true, id: GROUP, name: 'Teste' })),
    sendMessage: vi.fn(async () => ({})),
    removeParticipant: vi.fn(async () => {}),
  });
}

function rawMsg(text: string) {
  return {
    key: {
      id: `lab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      remoteJid: GROUP,
      fromMe: false,
      participant: USER,
    },
    message: { conversation: text },
    messageTimestamp: Math.floor(Date.now() / 1000),
    pushName: 'LabInject',
  };
}

describe('BaileysMessageNormalizer — sarcasmo (Rodada 4c)', () => {
  it('envia { text } — nunca string crua', async () => {
    const sendMessage = vi.fn(async () => ({}));
    const n = makeNormalizer({ sendMessage });

    await n.dispatchMessage(rawMsg('ei bot, tudo bem?'));

    expect(sendMessage).toHaveBeenCalledTimes(1);
    const [jid, content] = sendMessage.mock.calls[0];
    expect(jid).toBe(GROUP);
    expect(typeof content).not.toBe('string'); // controle negativo do bug
    expect(content).toEqual({ text: expect.any(String) });
    expect(content.text).toContain('nada ver com isso');
  });

  it('não envia quando a palavra "bot" não está presente', async () => {
    const sendMessage = vi.fn(async () => ({}));
    const n = makeNormalizer({ sendMessage });

    await n.dispatchMessage(rawMsg('bom dia a todos'));

    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('não envia quando sarcasmo está desligado no grupo', async () => {
    vi.mocked(getGroupMod).mockResolvedValueOnce({
      antispam: false, antiestrangeiro: false, autolink: false, bemvindo: false,
      detectar: false, remover: false, audit_only: false, antibot: false,
      casino: false, presentation_enabled: false, feedback: false,
      sarcasmo: false,
    } as any);

    const sendMessage = vi.fn(async () => ({}));
    const n = makeNormalizer({ sendMessage });

    await n.dispatchMessage(rawMsg('ei bot, tudo bem?'));

    expect(sendMessage).not.toHaveBeenCalled();
  });
});
