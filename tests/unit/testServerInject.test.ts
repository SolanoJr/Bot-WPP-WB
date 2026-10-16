import { describe, it, expect, vi } from 'vitest';
import {
  LAB_GROUP_ID,
  LabError,
  injectParticipantEvent,
  injectMessage,
  type LabAdapterLike,
} from '../../src/services/testServer';

const GROUP = '120363410094452673@g.us';
const OTHER = '120363419033272638@g.us'; // Figurinhas — nunca tocar
const USER = '5511999999999@c.us';

describe('lab inject — guard de grupo (403)', () => {
  it('rejects a group outside the allowlist and never touches the adapter', async () => {
    const adapter: LabAdapterLike = { handleGroupParticipantsUpdate: vi.fn() };
    const err = await injectParticipantEvent(adapter, {
      groupId: OTHER,
      userId: USER,
      action: 'add',
    }).catch((e) => e);

    expect(err).toBeInstanceOf(LabError);
    expect(err.status).toBe(403);
    expect(adapter.handleGroupParticipantsUpdate).not.toHaveBeenCalled();
  });

  it('rejects an unknown group the same way', async () => {
    await expect(
      injectParticipantEvent({ handleGroupParticipantsUpdate: vi.fn() }, {
        groupId: '000000000000000000@g.us',
        userId: USER,
        action: 'remove',
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('rejects a non-string groupId', async () => {
    await expect(
      injectMessage({}, { groupId: 42, senderId: USER, text: 'oi' }),
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe('lab inject — validação de payload (400)', () => {
  it('rejects missing userId', async () => {
    await expect(
      injectParticipantEvent({}, { groupId: GROUP, action: 'add' }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects action outside add|remove', async () => {
    await expect(
      injectParticipantEvent({}, { groupId: GROUP, userId: USER, action: 'promote' }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects missing senderId', async () => {
    await expect(
      injectMessage({}, { groupId: GROUP, text: '$lista' }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects empty text', async () => {
    await expect(
      injectMessage({}, { groupId: GROUP, senderId: USER, text: '' }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('lab inject — adapter ausente (404)', () => {
  it('reports missing adapter for participant event', async () => {
    await expect(
      injectParticipantEvent(null, { groupId: GROUP, userId: USER, action: 'add' }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('reports missing normalizer for message', async () => {
    await expect(
      injectMessage({}, { groupId: GROUP, senderId: USER, text: 'oi' }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('lab inject — happy path: evento de participante', () => {
  it("dispatches action='add' to the production handler", async () => {
    const handleGroupParticipantsUpdate = vi.fn().mockResolvedValue(undefined);
    const out = await injectParticipantEvent(
      { handleGroupParticipantsUpdate },
      { groupId: GROUP, userId: USER, action: 'add' },
    );

    expect(out).toEqual({ ok: true });
    expect(handleGroupParticipantsUpdate).toHaveBeenCalledTimes(1);
    expect(handleGroupParticipantsUpdate).toHaveBeenCalledWith({
      id: GROUP,
      action: 'add',
      participants: [USER],
    });
  });

  it("dispatches action='remove' (feedback de saída)", async () => {
    const handleGroupParticipantsUpdate = vi.fn().mockResolvedValue(undefined);
    await injectParticipantEvent(
      { handleGroupParticipantsUpdate },
      { groupId: GROUP, userId: USER, action: 'remove' },
    );

    expect(handleGroupParticipantsUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'remove' }),
    );
  });

  it('propagates handler errors', async () => {
    await expect(
      injectParticipantEvent(
        { handleGroupParticipantsUpdate: vi.fn().mockRejectedValue(new Error('boom')) },
        { groupId: GROUP, userId: USER, action: 'add' },
      ),
    ).rejects.toThrow('boom');
  });
});

describe('lab inject — happy path: mensagem', () => {
  it('dispatches through the normalizer with fromMe=false', async () => {
    const dispatchMessage = vi.fn().mockResolvedValue(undefined);
    const out = await injectMessage(
      { normalizer: { dispatchMessage } },
      { groupId: GROUP, senderId: USER, text: '$lista' },
    );

    expect(out.ok).toBe(true);
    expect(typeof out.messageId).toBe('string');
    expect(out.messageId.startsWith('lab-')).toBe(true);

    expect(dispatchMessage).toHaveBeenCalledTimes(1);
    const raw = dispatchMessage.mock.calls[0][0];
    expect(raw.key).toEqual({
      id: out.messageId,
      remoteJid: GROUP,
      fromMe: false,
      participant: USER,
    });
    expect(raw.message).toEqual({ conversation: '$lista' });
    expect(typeof raw.messageTimestamp).toBe('number');
  });

  it('never sets fromMe=true (would loop back to the bot)', async () => {
    const dispatchMessage = vi.fn().mockResolvedValue(undefined);
    await injectMessage(
      { normalizer: { dispatchMessage } },
      { groupId: GROUP, senderId: USER, text: 'oi' },
    );

    expect(dispatchMessage.mock.calls[0][0].key.fromMe).toBe(false);
  });

  it('passes mentions via extendedTextMessage.contextInfo.mentionedJid', async () => {
    const dispatchMessage = vi.fn().mockResolvedValue(undefined);
    await injectMessage(
      { normalizer: { dispatchMessage } },
      { groupId: GROUP, senderId: USER, text: '$mute', mentions: [USER] },
    );

    expect(dispatchMessage).toHaveBeenCalledTimes(1);
    const raw = dispatchMessage.mock.calls[0][0];
    expect(raw.message).toEqual({
      extendedTextMessage: {
        text: '$mute',
        contextInfo: { mentionedJidList: [USER] },
      },
    });
  });

  it('keeps conversation when mentions is empty', async () => {
    const dispatchMessage = vi.fn().mockResolvedValue(undefined);
    await injectMessage(
      { normalizer: { dispatchMessage } },
      { groupId: GROUP, senderId: USER, text: '$mute' },
    );

    expect(dispatchMessage.mock.calls[0][0].message).toEqual({ conversation: '$mute' });
  });

  it('LAB_GROUP_ID aponta para o grupo de teste', () => {
    expect(LAB_GROUP_ID).toBe(GROUP);
  });
});
