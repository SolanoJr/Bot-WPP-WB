import { describe, expect, it } from 'vitest';
import { matchDeleteRevoke, matchMessagesDelete } from '../../src/services/deleteE2EConfirmation';

const TARGET = {
  id: 'fresh-message-id',
  remoteJid: '120363410094452673@g.us',
};

describe('delete E2E confirmation correlation', () => {
  it('confirms only a REVOKE for the exact target stanza and group', () => {
    expect(matchDeleteRevoke(TARGET, [{
      key: { id: 'revoke-event-id', remoteJid: TARGET.remoteJid },
      message: { protocolMessage: { type: 'REVOKE', key: TARGET } },
    }])).toEqual({
      type: 'messages.update',
      targetId: TARGET.id,
      remoteJid: TARGET.remoteJid,
      protocolMessageType: 'REVOKE',
    });
  });

  it('rejects mismatched IDs, groups, and non-REVOKE updates', () => {
    expect(matchDeleteRevoke(TARGET, [{
      key: TARGET,
      message: { protocolMessage: { type: 'MESSAGE_EDIT', key: TARGET } },
    }])).toBeNull();
    expect(matchDeleteRevoke(TARGET, [{
      message: { protocolMessage: { type: 'REVOKE', key: { ...TARGET, id: 'other' } } },
    }])).toBeNull();
    expect(matchDeleteRevoke(TARGET, [{
      message: { protocolMessage: { type: 'REVOKE', key: { ...TARGET, remoteJid: 'other@g.us' } } },
    }])).toBeNull();
  });

  it('accepts messages.delete only when the server event names the target key', () => {
    expect(matchMessagesDelete(TARGET, { keys: [{ id: 'other', remoteJid: TARGET.remoteJid }, TARGET] })).toEqual({
      type: 'messages.delete',
      targetId: TARGET.id,
      remoteJid: TARGET.remoteJid,
    });
    expect(matchMessagesDelete(TARGET, { keys: [{ ...TARGET, remoteJid: 'other@g.us' }] })).toBeNull();
  });
});