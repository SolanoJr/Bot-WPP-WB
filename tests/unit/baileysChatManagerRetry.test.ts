/**
 * INC-027 — retry de groupMetadata no BaileysChatManager.getChat.
 * Causa raiz do "ban/kick não funcionam": query IQ intermitente + única
 * tentativa de 5s → isPermissionsVerified:false → "⏳ tente novamente".
 * Aqui: sucesso na 1ª, recuperação na 3ª tentativa e falha total.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { BaileysChatManager } from '../../src/platforms/whatsapp/baileys/BaileysChatManager';

const makeManager = (groupMetadataImpl: (jid: string) => Promise<any>) =>
  new BaileysChatManager({
    sock: { groupMetadata: groupMetadataImpl },
    platform: 'whatsapp',
    userId: '558581344211@s.whatsapp.net',
  });

const META = {
  subject: 'Grupo Teste',
  participants: [
    { id: '2592935567439@lid', phoneNumber: '558581344211@s.whatsapp.net', admin: 'admin' },
    { id: '111222333444@lid', phoneNumber: '558999999999@s.whatsapp.net', admin: null },
  ],
};

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('BaileysChatManager.getChat — retry de metadata (INC-027)', () => {
  it('resolve na 1ª tentativa sem delays extras', async () => {
    const gm = vi.fn().mockResolvedValue(META);
    const chat = await makeManager(gm as any).getChat('120363410094452673@g.us');
    expect(gm).toHaveBeenCalledTimes(1);
    expect(chat.isPermissionsVerified).toBe(true);
    expect(chat.participants).toHaveLength(2);
    expect(chat.participants[0].isAdmin).toBe(true);
  });

  it('recupera na 3ª tentativa após 2 falhas (backoff 1,5s/3s)', async () => {
    vi.useFakeTimers();
    const gm = vi
      .fn()
      .mockRejectedValueOnce(new Error('timed out waiting for message'))
      .mockRejectedValueOnce(new Error('timed out waiting for message'))
      .mockResolvedValueOnce(META);
    const mgr = makeManager(gm as any);
    const pending = mgr.getChat('120363410094452673@g.us');
    await vi.advanceTimersByTimeAsync(1500); // delay antes da 2ª tentativa
    await vi.advanceTimersByTimeAsync(3000); // delay antes da 3ª tentativa
    const chat = await pending;
    expect(gm).toHaveBeenCalledTimes(3);
    expect(chat.isPermissionsVerified).toBe(true);
    expect(chat.participants).toHaveLength(2);
  });

  it('falha total: verified=false, exatamente 3 tentativas', async () => {
    vi.useFakeTimers();
    const gm = vi.fn().mockRejectedValue(new Error('timed out waiting for message'));
    const pending = makeManager(gm as any).getChat('120363410094452673@g.us');
    await vi.advanceTimersByTimeAsync(4600); // percorre os dois backoffs
    const chat = await pending;
    expect(gm).toHaveBeenCalledTimes(3);
    expect(chat.isPermissionsVerified).toBe(false);
    expect(chat.participants).toEqual([]);
    expect(chat.name).toBe('');
  });
});
