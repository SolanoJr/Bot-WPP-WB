/**
 * INC-009 — accessors de meta de grupo (community_groups estendida com
 * description). Padrão newsHistory.test.ts: mock do driver sqlite com
 * tabela em memória; o mock replica o SQL (COALESCE, ORDER BY, UNION)
 * para exercitar a lógica dos accessors.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock sqlite: mini-DB em memória ─────────────────────────────────────
type Row = Record<string, any>;

const makeState = () => ({
  community_groups: new Map<string, Row>(),
  // JIDs "conhecidos" das outras tabelas (para listKnownGroupJids)
  group_mod: new Set<string>(),
  group_news: new Set<string>(),
  mod_member_joins: new Set<string>(),
});

let state: ReturnType<typeof makeState>;

vi.mock('sqlite', () => ({
  open: vi.fn(async () => ({
    exec: vi.fn(async () => { /* CREATE/ALTER tolerados */ }),
    get: vi.fn(async (sql: string, params: any[] = []) => {
      const s = String(sql);
      if (/FROM community_groups/i.test(s) && /WHERE group_id = \?/i.test(s)) {
        const row = state.community_groups.get(params[0]);
        return row ? { ...row } : undefined;
      }
      return undefined;
    }),
    all: vi.fn(async (sql: string) => {
      const s = String(sql);
      if (/SELECT DISTINCT group_id/i.test(s)) {
        // listKnownGroupJids: UNION das 4 tabelas
        const jids = new Set<string>([
          ...state.group_mod, ...state.group_news,
          ...state.mod_member_joins, ...state.community_groups.keys(),
        ]);
        return [...jids].map((group_id) => ({ group_id }));
      }
      if (/FROM community_groups/i.test(s)) {
        // listGroups: ORDER BY group_name ASC — no sqlite NULL vem primeiro
        const rows = [...state.community_groups.values()].map((r) => ({ ...r }));
        rows.sort((a, b) =>
          (a.group_name ?? '\u0000').localeCompare(b.group_name ?? '\u0000'));
        return rows;
      }
      return [];
    }),
    run: vi.fn(async (sql: string, params: any[] = []) => {
      const s = String(sql);
      if (/^UPDATE community_groups/i.test(s)) {
        const [name, desc, now, groupId] = params;
        const row = state.community_groups.get(groupId);
        if (!row) return { changes: 0 };
        // COALESCE(?, group_name): null não apaga o existente
        if (name !== null) row.group_name = name;
        if (desc !== null) row.description = desc;
        row.updated_at = now;
        return { changes: 1 };
      }
      if (/^INSERT INTO community_groups/i.test(s)) {
        // community_id '' é LITERAL no SQL — params = [groupId, name, now, desc]
        const [groupId, name, now, desc] = params;
        state.community_groups.set(groupId, {
          group_id: groupId, community_id: '',
          group_name: name, updated_at: now, description: desc,
        });
        return { changes: 1 };
      }
      return { changes: 0 };
    }),
  })),
}));

// databaseService importa loggerService — silenciar no teste.
vi.mock('../../src/services/loggerService', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  logWarning: vi.fn(),
  logInfo: vi.fn(),
  logError: vi.fn(),
}));

const freshDb = async () => {
  vi.resetModules();
  state = makeState();
  const mod: any = await import('../../src/services/databaseService.js');
  return mod;
};

describe('INC-009 — upsertGroupMeta / getGroupMeta / listGroups / listKnownGroupJids', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('cria row nova com community_id vazio (welcomeService corrige depois)', async () => {
    const db = await freshDb();
    await db.upsertGroupMeta('120363419241913965@g.us', 'Geek Fortal 085', null);
    const meta = await db.getGroupMeta('120363419241913965@g.us');
    expect(meta).not.toBeNull();
    expect(meta!.groupId).toBe('120363419241913965@g.us');
    expect(meta!.name).toBe('Geek Fortal 085');
    expect(meta!.communityId).toBe('');
    expect(meta!.description).toBeNull();
  });

  it('atualiza name sem apagar description existente (COALESCE)', async () => {
    const db = await freshDb();
    await db.upsertGroupMeta('g1@g.us', 'Nome 1', 'Descrição antiga');
    await db.upsertGroupMeta('g1@g.us', 'Nome 2', null); // description null → COALESCE mantém
    const meta = await db.getGroupMeta('g1@g.us');
    expect(meta!.name).toBe('Nome 2');
    expect(meta!.description).toBe('Descrição antiga');
  });

  it('name null também não apaga o existente (COALESCE)', async () => {
    const db = await freshDb();
    await db.upsertGroupMeta('g1@g.us', 'Nome 1', null);
    await db.upsertGroupMeta('g1@g.us', null, 'Nova desc');
    const meta = await db.getGroupMeta('g1@g.us');
    expect(meta!.name).toBe('Nome 1');
    expect(meta!.description).toBe('Nova desc');
  });

  it('NÃO apaga community_id real de row pré-existente (caminho welcomeService)', async () => {
    const db = await freshDb();
    // welcomeService inseriu primeiro com community real
    state.community_groups.set('g2@g.us', {
      group_id: 'g2@g.us', community_id: 'comunidade-123',
      group_name: 'Antigo', updated_at: 1, description: null,
    });
    await db.upsertGroupMeta('g2@g.us', 'Novo nome', 'desc');
    const meta = await db.getGroupMeta('g2@g.us');
    expect(meta!.communityId).toBe('comunidade-123'); // preservado
    expect(meta!.name).toBe('Novo nome');
  });

  it('listGroups ordena por group_name (NULL primeiro, como sqlite ASC)', async () => {
    const db = await freshDb();
    await db.upsertGroupMeta('a@g.us', 'Zebra', null);
    await db.upsertGroupMeta('b@g.us', 'Abelha', null);
    await db.upsertGroupMeta('c@g.us', null, null); // sem nome
    const list = await db.listGroups();
    expect(list.map((g: any) => g.name)).toEqual([null, 'Abelha', 'Zebra']);
  });

  it('listKnownGroupJids: dedup entre 4 tabelas + strip do prefixo wpp:', async () => {
    const db = await freshDb();
    state.group_mod.add('120363419033272638@g.us');
    state.group_news.add('wpp:120363410094452673@g.us');   // com prefixo
    state.mod_member_joins.add('120363419241913965@g.us');
    state.community_groups.set('120363419033272638@g.us', {
      group_id: '120363419033272638@g.us', community_id: '',
      group_name: 'Figurinhas', updated_at: 1, description: null,
    });
    const jids = await db.listKnownGroupJids();
    expect(jids.sort()).toEqual([
      '120363410094452673@g.us',   // wpp: stripped
      '120363419033272638@g.us',   // dedup (group_mod + community_groups)
      '120363419241913965@g.us',
    ]);
  });
});
