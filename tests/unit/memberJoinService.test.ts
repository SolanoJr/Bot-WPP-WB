import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleMemberJoin } from '../../src/services/memberJoinService';

const GROUP = '120363410094452673@g.us';
const INTRUSO = '6289562706508@lid';
const DONO = '5588998314322@c.us';
const BOT_LID = '2592935567439@lid';

vi.mock('../../src/services/databaseService.js', () => ({
  isUserBanned: vi.fn(async (_groupId: string, userId: string) =>
    String(userId).includes('6289562706508'),
  ),
  getGroupMod: vi.fn(async () => ({
    antibotas: true,
    antiestrangeiro: false,
    bemvindo: false,
    audit_only: false,
  })),
  recordMemberJoin: vi.fn(async () => {}),
  recordMemberRemove: vi.fn(async () => {}),
  banUser: vi.fn(async () => {}),
}))

function makeDeps() {
  return {
    removeParticipant: vi.fn(async () => {}),
    sendMessage: vi.fn(async () => ({})),
  };
}

describe('handleMemberJoin — ban persistente', () => {
  beforeEach(() => vi.clearAllMocks());

  it('remove quem está banido ao reentrar', async () => {
    const deps = makeDeps();
    await handleMemberJoin(deps, { groupId: GROUP, members: [INTRUSO] });
    expect(deps.removeParticipant).toHaveBeenCalledWith(GROUP, INTRUSO);
  });

  it('preserva o @lid ao remover (não converte para @c.us)', async () => {
    const deps = makeDeps();
    await handleMemberJoin(deps, { groupId: GROUP, members: [INTRUSO] });
    const alvo = deps.removeParticipant.mock.calls[0][1];
    expect(alvo).toContain('@lid');
    expect(alvo).not.toContain('@c.us');
  });

  it('não remove quem não está banido', async () => {
    const deps = makeDeps();
    await handleMemberJoin(deps, { groupId: GROUP, members: ['5511988887777@c.us'] });
    expect(deps.removeParticipant).not.toHaveBeenCalled();
  });
});

describe('handleMemberJoin — imunidade do MASTER e do bot', () => {
  beforeEach(() => vi.clearAllMocks());

  it('NUNCA remove o dono, mesmo se aparecer como banido', async () => {
    const deps = makeDeps();
    await handleMemberJoin(deps, { groupId: GROUP, members: [DONO] });
    expect(deps.removeParticipant).not.toHaveBeenCalled();
  });

  it('NUNCA remove o próprio bot', async () => {
    const deps = makeDeps();
    await handleMemberJoin(deps, { groupId: GROUP, members: [BOT_LID] });
    expect(deps.removeParticipant).not.toHaveBeenCalled();
  });

  it('remove o intruso mas poupa o dono quando entram juntos', async () => {
    const deps = makeDeps();
    await handleMemberJoin(deps, { groupId: GROUP, members: [DONO, INTRUSO] });
    const alvos = deps.removeParticipant.mock.calls.map((c) => c[1]);
    expect(alvos).toContain(INTRUSO);
    expect(alvos).not.toContain(DONO);
  });
});

describe('handleMemberJoin — robustez', () => {
  beforeEach(() => vi.clearAllMocks());

  it('ignora evento sem grupo ou sem membros', async () => {
    const deps = makeDeps();
    await handleMemberJoin(deps, { groupId: '', members: [INTRUSO] });
    await handleMemberJoin(deps, { groupId: GROUP, members: [] });
    expect(deps.removeParticipant).not.toHaveBeenCalled();
  });

  it('não lança quando removeParticipant falha', async () => {
    const deps = makeDeps();
    deps.removeParticipant.mockRejectedValueOnce(new Error('sem permissão de admin'));
    await expect(
      handleMemberJoin(deps, { groupId: GROUP, members: [INTRUSO] }),
    ).resolves.toBeUndefined();
  });
});
