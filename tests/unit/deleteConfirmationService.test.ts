import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestConfirmedDelete } from '../../src/services/deleteConfirmationService';

type Sock = { ev: EventEmitter };

const TARGET = {
  id: 'target-message-id',
  remoteJid: '120363410094452673@g.us',
  fromMe: true,
  participant: '123456789012345@lid',
  participantAlt: '5511999999999@s.whatsapp.net',
  addressingMode: 'lid',
};

function upsert(target: any = TARGET, envelopeId = 'revoke-envelope') {
  return {
    messages: [{
      key: { id: envelopeId, remoteJid: TARGET.remoteJid, fromMe: true, participant: 'envelope@lid' },
      messageTimestamp: Math.floor(Date.now() / 1000),
      message: { protocolMessage: { type: 0, key: target } },
    }],
  };
}

function request(sock: Sock, sendDelete: () => Promise<any>, timeoutMs = 1000) {
  return requestConfirmedDelete({
    platform: 'whatsapp',
    chatId: TARGET.remoteJid,
    targetKey: TARGET,
    correlationId: 'corr-service-test',
    timeoutMs,
    sock,
    sendDelete,
  });
}

describe('deleteConfirmationService', () => {
  afterEach(() => vi.useRealTimers());

  it('não retorna PASS somente porque o adapter aceitou', async () => {
    vi.useFakeTimers();
    const sock = { ev: new EventEmitter() };
    const pending = request(sock, async () => ({ id: 'accepted-only' }), 100);
    await Promise.resolve();
    vi.advanceTimersByTime(100);
    await expect(pending).resolves.toMatchObject({
      requested: true,
      accepted: true,
      confirmed: false,
      finalState: 'TIMEOUT',
    });
  });

  it('confirma messages.upsert com REVOKE correlacionado', async () => {
    const sock = { ev: new EventEmitter() };
    const pending = request(sock, async () => {
      sock.ev.emit('messages.upsert', upsert());
      return { id: 'accepted' };
    });
    await expect(pending).resolves.toMatchObject({
      requested: true,
      accepted: true,
      confirmed: true,
      finalState: 'PASS',
      confirmation: {
        confirmationSource: 'messages.upsert',
        protocolMessageType: 'REVOKE',
        envelopeMessageId: 'revoke-envelope',
        targetId: TARGET.id,
      },
    });
  });

  it('ignora REVOKE não correlacionado e continua aguardando', async () => {
    vi.useFakeTimers();
    const sock = { ev: new EventEmitter() };
    const pending = request(sock, async () => {
      sock.ev.emit('messages.upsert', upsert({ ...TARGET, id: 'other-id' }));
      return { id: 'accepted' };
    }, 100);
    await Promise.resolve();
    vi.advanceTimersByTime(100);
    await expect(pending).resolves.toMatchObject({ finalState: 'TIMEOUT', confirmed: false });
  });

  it('correlaciona pelo protocolMessage.key e não pelo id do envelope', async () => {
    const sock = { ev: new EventEmitter() };
    const pending = request(sock, async () => {
      sock.ev.emit('messages.upsert', upsert(TARGET, 'different-envelope-id'));
      return { id: 'accepted' };
    });
    await expect(pending).resolves.toMatchObject({
      finalState: 'PASS',
      confirmation: { envelopeMessageId: 'different-envelope-id', targetId: TARGET.id },
    });
  });

  it('confirma messages.update e messages.delete', async () => {
    const updateSock = { ev: new EventEmitter() };
    const update = request(updateSock, async () => {
      updateSock.ev.emit('messages.update', [{
        key: { id: 'update-envelope', remoteJid: TARGET.remoteJid },
        message: { protocolMessage: { type: 'REVOKE', key: TARGET } },
      }]);
      return { id: 'accepted' };
    });
    await expect(update).resolves.toMatchObject({ finalState: 'PASS', confirmation: { type: 'messages.update' } });

    const deleteSock = { ev: new EventEmitter() };
    const deletion = request(deleteSock, async () => {
      deleteSock.ev.emit('messages.delete', { keys: [TARGET] });
      return { id: 'accepted' };
    });
    await expect(deletion).resolves.toMatchObject({ finalState: 'PASS', confirmation: { type: 'messages.delete' } });
  });

  it('retorna FAIL quando o adapter lança erro', async () => {
    const sock = { ev: new EventEmitter() };
    const result = await request(sock, async () => { throw new Error('socket indisponível'); });
    expect(result).toMatchObject({ requested: true, accepted: false, confirmed: false, finalState: 'FAIL', error: 'socket indisponível' });
  });

  it('trata null/undefined como solicitação não aceita', async () => {
    const sock = { ev: new EventEmitter() };
    await expect(request(sock, async () => null)).resolves.toMatchObject({
      requested: true, accepted: false, confirmed: false, finalState: 'FAIL',
    });
  });

  it('conclui uma única vez e remove todos os listeners após PASS', async () => {
    const sock = { ev: new EventEmitter() };
    const pending = request(sock, async () => {
      sock.ev.emit('messages.upsert', upsert(TARGET, 'first'));
      sock.ev.emit('messages.upsert', upsert(TARGET, 'second'));
      return { id: 'accepted' };
    });
    const result = await pending;
    expect(result.confirmation?.envelopeMessageId).toBe('first');
    expect(sock.ev.listenerCount('messages.upsert')).toBe(0);
    expect(sock.ev.listenerCount('messages.update')).toBe(0);
    expect(sock.ev.listenerCount('messages.delete')).toBe(0);
  });

  it('remove listeners após TIMEOUT e não reabre o estado por evento tardio', async () => {
    vi.useFakeTimers();
    const sock = { ev: new EventEmitter() };
    const pending = request(sock, async () => ({ id: 'accepted' }), 100);
    await Promise.resolve();
    vi.advanceTimersByTime(100);
    const result = await pending;
    sock.ev.emit('messages.upsert', upsert());
    expect(result.finalState).toBe('TIMEOUT');
    expect(result.confirmed).toBe(false);
    expect(sock.ev.listenerCount('messages.upsert')).toBe(0);
  });

  it('envia exatamente uma solicitação, preserva correlationId e a chave LID', async () => {
    const sock = { ev: new EventEmitter() };
    let sends = 0;
    const pending = request(sock, async () => {
      sends++;
      sock.ev.emit('messages.upsert', upsert());
      return { id: 'accepted' };
    });
    const result = await pending;
    expect(sends).toBe(1);
    expect(result.confirmation?.correlationId).toBe('corr-service-test');
    expect(result.confirmation?.targetKey).toMatchObject({
      participant: TARGET.participant,
      participantAlt: TARGET.participantAlt,
      addressingMode: 'lid',
    });
  });

  it('retorna FAIL sem solicitar quando a chave é inválida', async () => {
    const sock = { ev: new EventEmitter() };
    let sends = 0;
    const result = await requestConfirmedDelete({
      platform: 'whatsapp',
      chatId: TARGET.remoteJid,
      targetKey: { remoteJid: TARGET.remoteJid } as any,
      correlationId: 'invalid-key',
      sock,
      sendDelete: async () => { sends++; },
    });
    expect(result).toMatchObject({ requested: false, accepted: false, finalState: 'FAIL' });
    expect(sends).toBe(0);
  });
});
