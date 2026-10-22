/**
 * INC-015 D2 — commandConfigService persistido em SQLite.
 *
 * O service antigo era um Map em memória (estado morria no restart e não
 * tinha leitor). Aqui provamos o contrato novo:
 *   - default HABILITADO (sem registro = true)
 *   - setEnabled grava e isEnabled lê (upsert)
 *   - estado visível por outra instância (não é memória interna)
 *   - fail-open: banco fora do ar NUNCA desliga comandos
 *   - grupos independentes
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock do databaseService: tabela command_state em memória ───
const rows = new Map<string, { enabled: number }>();
const key = (g: string, c: string) => `${g}|${c}`;

vi.mock('../../src/services/databaseService', () => ({
  getDb: vi.fn(async () => ({
    get: async (_sql: string, params: unknown[]) => {
      const k = key(String(params[0]), String(params[1]));
      return rows.has(k) ? { enabled: rows.get(k)!.enabled } : undefined;
    },
    run: async (_sql: string, params: unknown[]) => {
      const k = key(String(params[0]), String(params[1]));
      rows.set(k, { enabled: params[2] ? 1 : 0 });
    },
  })),
}));

import { CommandConfigService } from '../../src/services/commandConfigService';
import { getDb } from '../../src/services/databaseService';

describe('CommandConfigService (INC-015 D2 — persistido)', () => {
  const G1 = '120363410094452673@g.us';
  const G2 = '120363000000000001@g.us';
  let service: CommandConfigService;

  beforeEach(() => {
    rows.clear();
    service = new CommandConfigService();
  });

  it('retorna HABILITADO por padrão (sem registro = true)', async () => {
    expect(await service.isEnabled(G1, 'ping')).toBe(true);
  });

  it('desativa e reativa via upsert', async () => {
    await service.setEnabled(G1, 'ping', false);
    expect(await service.isEnabled(G1, 'ping')).toBe(false);
    await service.setEnabled(G1, 'ping', true);
    expect(await service.isEnabled(G1, 'ping')).toBe(true);
  });

  it('estado sobrevive a nova instância (não é memória interna)', async () => {
    await service.setEnabled(G1, 'ping', false);
    const novaInstancia = new CommandConfigService();
    expect(await novaInstancia.isEnabled(G1, 'ping')).toBe(false);
  });

  it('fail-open: banco fora do ar NUNCA desliga comando', async () => {
    await service.setEnabled(G1, 'ping', false); // grava desativado (banco ok)
    vi.mocked(getDb).mockRejectedValueOnce(new Error('db down')); // leitura cai
    expect(await service.isEnabled(G1, 'ping')).toBe(true); // e ainda assim → true
  });

  it('grupos são independentes', async () => {
    await service.setEnabled(G1, 'ping', false);
    expect(await service.isEnabled(G2, 'ping')).toBe(true);
    expect(await service.isEnabled(G1, 'ping')).toBe(false);
  });
});
