/**
 * PROBLEMA 2 (23/10) — resposta da apresentação NO GRUPO:
 * replyPresentationToGroup envia UMA mensagem (foto + caption com o template
 * formatado) quoted na última mensagem coletada do apresentador. Foto é
 * enriquecimento: falha no envio com imagem cai para texto puro com quote;
 * falha total retorna false e não lança (o espelho Telegram segue).
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/services/loggerService', () => ({
  default: { info: () => {}, warn: () => {}, error: () => {} },
  logInfo: () => {}, logWarning: () => {}, logError: () => {},
}));

import { replyPresentationToGroup } from '../../src/services/presentationPublisher';

const GRUPO = '120363410094452673@g.us';

function makeRec(over: Record<string, any> = {}): any {
  return {
    presentation_id: `${GRUPO}|u`,
    platform: 'whatsapp',
    group_id: GRUPO,
    user_id: '5585999999999@s.whatsapp.net',
    phone_number: '5585999999999',
    display_name: 'Fulano',
    nome: 'João Silva',
    idade: 30,
    genero: null,
    trabalho: 'informática',
    hobbies: null,
    bio: null,
    orientacao: null,
    estado_civil: null,
    bairro: null,
    rede_social: null,
    photo_ref: null,
    photo_source: null,
    original_text: 'João Silva\nTenho 30 anos e trabalho com informática',
    source_message_ids: JSON.stringify(['AAA', 'BBB']),
    tg_chat_id: null,
    tg_thread_id: null,
    tg_message_id: null,
    status: 'consolidated',
    created_at: 1,
    updated_at: 2,
    ...over,
  };
}

const RAW = { key: { id: 'BBB', remoteJid: GRUPO }, message: { conversation: '...' } };

describe('replyPresentationToGroup — quote + template + foto no grupo', () => {
  it('envia UMA mensagem: foto picsum (seed = número) + caption com template, quoted na ÚLTIMA mensagem coletada', async () => {
    const sendMessage = vi.fn(async (_jid: string, _content: any, _opts?: any) => ({}));
    const loadMessage = vi.fn(async (_jid: string, _id: string) => RAW);
    const ok = await replyPresentationToGroup(makeRec(), { sendMessage, loadMessage });

    expect(ok).toBe(true);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    const [jid, content, opts] = sendMessage.mock.calls[0];
    expect(jid).toBe(GRUPO);
    expect(content.image).toEqual({ url: 'https://picsum.photos/seed/5585999999999/512/512' });
    expect(content.caption).toContain('João Silva');
    expect(content.caption).toContain('30 anos');
    expect(content.caption).toContain('informática');
    expect(content.caption).toContain('t.me/Fortaleza_085/2');
    expect(opts).toEqual({ quoted: RAW });
    // quote aponta para a ÚLTIMA mensagem coletada, não a primeira
    expect(loadMessage).toHaveBeenCalledWith(GRUPO, 'BBB');
  });

  it('usa o BUFFER da foto enviada no grupo quando existe', async () => {
    const sendMessage = vi.fn(async (_jid: string, _content: any, _opts?: any) => ({}));
    const buf = Buffer.from('imagem');
    await replyPresentationToGroup(makeRec(), { sendMessage, loadMessage: vi.fn(async (_jid: string, _id: string) => RAW) }, { buffer: buf });
    const [, content] = sendMessage.mock.calls[0];
    expect(content.image).toBe(buf);
  });

  it('usa photo.url quando a apresentação tem foto externa', async () => {
    const sendMessage = vi.fn(async (_jid: string, _content: any, _opts?: any) => ({}));
    await replyPresentationToGroup(
      makeRec(),
      { sendMessage, loadMessage: vi.fn(async (_jid: string, _id: string) => RAW) },
      { url: 'https://exemplo.com/foto.jpg' },
    );
    const [, content] = sendMessage.mock.calls[0];
    expect(content.image).toEqual({ url: 'https://exemplo.com/foto.jpg' });
  });

  it('loadMessage não acha (LAB inject) → monta QUOTED STUB {key,message} com participant do user_id', async () => {
    const sendMessage = vi.fn(async (_jid: string, _content: any, _opts?: any) => ({}));
    const ok = await replyPresentationToGroup(makeRec(), { sendMessage, loadMessage: vi.fn(async () => undefined) });
    expect(ok).toBe(true);
    const [, , opts] = sendMessage.mock.calls[0];
    expect(opts.quoted.key).toEqual({
      remoteJid: GRUPO, id: 'BBB', fromMe: false,
      participant: '5585999999999@s.whatsapp.net',
    });
    expect(opts.quoted.message).toEqual({ conversation: 'João Silva\nTenho 30 anos e trabalho com informática' });
  });

  it('degraus: foto+quote falha → FOTO SEM QUOTE (texto nunca roda)', async () => {
    const sendMessage = vi.fn(async (_jid: string, _content: any, _opts?: any) => {
      if (_content.image && _opts?.quoted) throw new Error('quote inválido');
      return {};
    });
    const ok = await replyPresentationToGroup(makeRec(), { sendMessage, loadMessage: vi.fn(async () => RAW) });
    expect(ok).toBe(true);
    expect(sendMessage).toHaveBeenCalledTimes(2);
    const [, content, opts] = sendMessage.mock.calls[1];
    expect(content.image).toBeDefined();
    expect(opts).toEqual({});
  });

  it('foto falha AMBAS (com e sem quote) → fallback: TEXTO com quote', async () => {
    const sendMessage = vi.fn(async (_jid: string, content: any, _opts?: any) => {
      if (content.image) throw new Error('media upload falhou');
      return {};
    });
    const ok = await replyPresentationToGroup(makeRec(), { sendMessage, loadMessage: vi.fn(async () => RAW) });

    expect(ok).toBe(true);
    expect(sendMessage).toHaveBeenCalledTimes(3);
    const [jid, content, opts] = sendMessage.mock.calls[2];
    expect(jid).toBe(GRUPO);
    expect(content.text).toContain('João Silva');
    expect(opts).toEqual({ quoted: RAW });
  });

  it('falha total (foto E texto) → retorna false, NÃO lança', async () => {
    const sendMessage = vi.fn(async () => { throw new Error('socket morto'); });
    const ok = await replyPresentationToGroup(makeRec(), { sendMessage, loadMessage: vi.fn(async (_jid: string, _id: string) => RAW) });
    expect(ok).toBe(false);
  });

  it('sock ausente → false sem tocar em nada', async () => {
    expect(await replyPresentationToGroup(makeRec(), null)).toBe(false);
    expect(await replyPresentationToGroup(makeRec(), {})).toBe(false);
  });

  it('source_message_ids vazio → sem quote, sem crash', async () => {
    const sendMessage = vi.fn(async (_jid: string, _content: any, _opts?: any) => ({}));
    const ok = await replyPresentationToGroup(
      makeRec({ source_message_ids: null }),
      { sendMessage, loadMessage: vi.fn(async (_jid: string, _id: string) => RAW) },
    );
    expect(ok).toBe(true);
    expect(sendMessage.mock.calls[0][2]).toEqual({});
  });

  it('messageId NORMALIZADO (whatsapp:558…:ID) → loadMessage recebe o stanzaId CRU', async () => {
    const sendMessage = vi.fn(async (_jid: string, _content: any, _opts?: any) => ({}));
    const loadMessage = vi.fn(async (_jid: string, _id: string) => RAW);
    await replyPresentationToGroup(
      makeRec({ source_message_ids: JSON.stringify(['whatsapp:558581344211:lab-123-abc']) }),
      { sendMessage, loadMessage },
    );
    expect(loadMessage).toHaveBeenCalledWith(GRUPO, 'lab-123-abc');
  });
});
