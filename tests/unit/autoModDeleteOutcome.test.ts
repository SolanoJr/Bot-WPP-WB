import { describe, expect, it, vi } from 'vitest';

const { requestConfirmedDelete } = vi.hoisted(() => ({ requestConfirmedDelete: vi.fn() }));
vi.mock('../../src/services/deleteConfirmationService', () => ({
  requestConfirmedDelete,
}));

vi.mock('../../src/services/databaseService', () => ({
  getGroupMod: vi.fn(async () => ({
    antiestrangeiro: false,
    remover: true,
    autolink: false,
    antispam: false,
    detectar: true,
    audit_only: true,
    antibot: true,
    casino: false,
  })),
  banUser: vi.fn(async () => {}),
  recordMessageFingerprint: vi.fn(async () => {}),
  getRecentFingerprintCount: vi.fn(async () => 0),
  cleanupOldFingerprintEntries: vi.fn(async () => {}),
  cleanupOldJoinEntries: vi.fn(async () => {}),
}));

vi.mock('../../src/services/infractions', () => ({
  recordInfraction: vi.fn(async () => 1),
}));

import {
  evaluate,
  moderationStateFromDeleteOutcome,
} from '../../src/services/autoModEngine';

const GROUP = '120363410094452673@g.us';
const USER = '5511999999999@s.whatsapp.net';

function ctx() {
  return {
    sock: { ev: { on: vi.fn(), off: vi.fn() } },
    userId: '558581344211@s.whatsapp.net',
    groupName: 'Grupo teste',
    getChat: vi.fn(async () => ({ participants: [], id: GROUP })),
    sendMessage: vi.fn(async () => null),
    removeParticipant: vi.fn(async () => {}),
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function message(message: any = { conversation: 'mensagem normal' }) {
  return {
    key: { id: 'msg-state', remoteJid: GROUP, fromMe: false, participant: USER },
    message,
    messageTimestamp: Date.now(),
  } as any;
}

describe('AutoMod — contrato controlado de DeleteOutcome', () => {
  it.each([
    [{ requested: true, accepted: true, confirmed: true, finalState: 'PASS' }, { deleteRequested: true, deleteAccepted: true, deleteConfirmed: true, finalState: 'PASS' }],
    [{ requested: true, accepted: true, confirmed: false, finalState: 'TIMEOUT' }, { deleteRequested: true, deleteAccepted: true, deleteConfirmed: false, finalState: 'TIMEOUT' }],
    [{ requested: true, accepted: false, confirmed: false, finalState: 'FAIL' }, { deleteRequested: true, deleteAccepted: false, deleteConfirmed: false, finalState: 'FAIL' }],
  ])('converte o outcome sem promover accepted a confirmed', (outcome, expected) => {
    expect(moderationStateFromDeleteOutcome(outcome as any)).toEqual(expected);
  });

  it('em audit_only detecta, planeja, não chama o serviço e não envia delete', async () => {
    requestConfirmedDelete.mockClear();
    const result = await evaluate(
      message({ buttonsMessage: { contentText: 'ganhe dinheiro', buttons: [] } }),
      ctx() as any,
      GROUP,
      USER,
      '🤖',
    );
    expect(result.moderationState).toMatchObject({
      detected: true,
      actionPlanned: true,
      deleteRequested: false,
      deleteAccepted: false,
      deleteConfirmed: false,
      finalState: 'AUDIT_ONLY',
    });
    expect(requestConfirmedDelete).not.toHaveBeenCalled();
  });

  it('mensagem normal mantém estado NONE', async () => {
    const result = await evaluate(message(), ctx() as any, GROUP, USER, 'Pessoa');
    expect(result.moderationState).toMatchObject({
      detected: false,
      actionPlanned: false,
      deleteRequested: false,
      deleteAccepted: false,
      deleteConfirmed: false,
      finalState: 'NONE',
    });
  });
});
