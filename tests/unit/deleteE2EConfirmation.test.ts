import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createDeleteConfirmationWaiter,
  matchDeleteRevoke,
  matchMessagesDelete,
  matchMessagesUpsert,
} from '../../src/services/deleteE2EConfirmation';
import { persistDeleteE2EResult } from '../../src/services/deleteE2EResult';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TARGET = {
  id: 'fresh-message-id',
  remoteJid: '120363410094452673@g.us',
  fromMe: true,
};

function upsert(type: number | string = 0, target: any = TARGET, envelopeId = 'revoke-envelope-id') {
  return {
    messages: [{
      key: { id: envelopeId, remoteJid: TARGET.remoteJid, fromMe: true, participant: 'external-envelope-participant' },
      messageTimestamp: Math.floor(Date.now() / 1000),
      message: { protocolMessage: { type, key: target } },
    }],
  };
}

describe('delete E2E confirmation correlation', () => {
  afterEach(() => vi.useRealTimers());

  it('confirms REVOKE from messages.upsert using the nested target key and numeric type 0', () => {
    expect(matchMessagesUpsert(TARGET, upsert())).toMatchObject({
      type: 'messages.upsert',
      confirmationSource: 'messages.upsert',
      targetId: TARGET.id,
      remoteJid: TARGET.remoteJid,
      protocolMessageType: 'REVOKE',
      envelopeMessageId: 'revoke-envelope-id',
      targetKey: TARGET,
    });
  });

  it('accepts normalized string REVOKE as well as numeric and string numeric forms', () => {
    expect(matchMessagesUpsert(TARGET, upsert('REVOKE'))?.protocolMessageType).toBe('REVOKE');
    expect(matchMessagesUpsert(TARGET, upsert('0'))?.protocolMessageType).toBe('REVOKE');
  });

  it('rejects mismatched target id, group, fromMe and non-REVOKE upserts', () => {
    expect(matchMessagesUpsert(TARGET, upsert(0, { ...TARGET, id: 'other' }))).toBeNull();
    expect(matchMessagesUpsert(TARGET, upsert(0, { ...TARGET, remoteJid: 'other@g.us' }))).toBeNull();
    expect(matchMessagesUpsert(TARGET, upsert(0, { ...TARGET, fromMe: false }))).toBeNull();
    expect(matchMessagesUpsert(TARGET, upsert('MESSAGE_EDIT'))).toBeNull();
    expect(matchMessagesUpsert(TARGET, { messages: [{ key: TARGET, message: { conversation: 'normal' } }] })).toBeNull();
  });

  it('does not compare the external envelope participant against the nested target key', () => {
    const result = matchMessagesUpsert(TARGET, upsert());
    expect(result?.targetKey?.participant).toBeUndefined();
    expect(result?.envelopeMessageId).toBe('revoke-envelope-id');
  });

  it('supports messages.update with both known Baileys shapes', () => {
    expect(matchDeleteRevoke(TARGET, [{
      key: { id: 'revoke-event-id', remoteJid: TARGET.remoteJid, fromMe: true },
      message: { protocolMessage: { type: 0, key: TARGET } },
    }])).toMatchObject({ type: 'messages.update', protocolMessageType: 'REVOKE' });
    expect(matchDeleteRevoke(TARGET, [{
      key: { id: 'revoke-event-id-2', remoteJid: TARGET.remoteJid, fromMe: true },
      update: { message: { protocolMessage: { type: 'REVOKE', key: TARGET } } },
    }])).toMatchObject({ type: 'messages.update', protocolMessageType: 'REVOKE' });
  });

  it('accepts messages.delete only when the server event names the exact target key', () => {
    expect(matchMessagesDelete(TARGET, { keys: [{ id: 'other', remoteJid: TARGET.remoteJid }, TARGET] })).toMatchObject({
      type: 'messages.delete', targetId: TARGET.id, remoteJid: TARGET.remoteJid,
    });
    expect(matchMessagesDelete(TARGET, { keys: [{ ...TARGET, remoteJid: 'other@g.us' }] })).toBeNull();
  });

  it('captures a fast upsert emitted immediately after the waiter is registered', async () => {
    const ev = new EventEmitter();
    const waiter = createDeleteConfirmationWaiter({ ev }, TARGET, 'corr-fast', 1000);
    ev.emit('messages.upsert', upsert());
    await expect(waiter.promise).resolves.toMatchObject({
      type: 'messages.upsert', correlationId: 'corr-fast', targetId: TARGET.id,
    });
    expect(waiter.didTimeout()).toBe(false);
  });

  it('times out without confirmation and removes all listeners', async () => {
    vi.useFakeTimers();
    const ev = new EventEmitter();
    const waiter = createDeleteConfirmationWaiter({ ev }, TARGET, 'corr-timeout', 100);
    ev.emit('messages.upsert', { messages: [{ key: TARGET, message: { conversation: 'unrelated' } }] });
    vi.advanceTimersByTime(100);
    await expect(waiter.promise).resolves.toBeNull();
    expect(waiter.didTimeout()).toBe(true);
    expect(ev.listenerCount('messages.upsert')).toBe(0);
    expect(ev.listenerCount('messages.update')).toBe(0);
    expect(ev.listenerCount('messages.delete')).toBe(0);
  });

  it('settles once when duplicate REVOKE events arrive', async () => {
    const ev = new EventEmitter();
    const waiter = createDeleteConfirmationWaiter({ ev }, TARGET, 'corr-duplicate', 1000);
    ev.emit('messages.upsert', upsert(0, TARGET, 'first-envelope'));
    ev.emit('messages.upsert', upsert(0, TARGET, 'second-envelope'));
    const result: any = await waiter.promise;
    expect(result.envelopeMessageId).toBe('first-envelope');
    expect(ev.listenerCount('messages.upsert')).toBe(0);
  });
});

describe('delete E2E result persistence', () => {
  it('persists the audit fields as one JSONL record', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'delete-e2e-result-'));
    const file = path.join(dir, 'results.jsonl');
    try {
      persistDeleteE2EResult({
        correlationId: 'corr-persist',
        targetMessageId: TARGET.id,
        remoteJid: TARGET.remoteJid,
        confirmationSource: 'messages.upsert',
        confirmationType: 'messages.upsert',
        protocolMessageType: 'REVOKE',
        envelopeMessageId: 'envelope',
        cleanupAttempted: false,
        cleanupConfirmed: false,
        finalState: 'PASS',
      }, file);
      const records = fs.readFileSync(file, 'utf8').trim().split('\n').map(JSON.parse);
      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({ correlationId: 'corr-persist', finalState: 'PASS', protocolMessageType: 'REVOKE' });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
