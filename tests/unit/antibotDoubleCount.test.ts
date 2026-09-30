/**
 * REGRESSÃO DOCUMENTADA — double-counting de sinais estruturais.
 *
 * BUG CONHECIDO (pré-existente em 8371149, ainda presente em d35547c):
 *
 * Uma ÚNICA mensagem estrutural (ex.: buttonsMessage) produz DOIS sinais
 * em botSignals, porque:
 *   - linha ~532: msgType.buttonsMessage → push('mensagem-interativa')
 *   - linha ~538: structuralSignals → push('buttonsMessage')
 * Resultado: botSignals.length === 2 → threshold (>=2) atingido → BAN
 * com UMA só mensagem estrutural, de um remetente brasileiro, com nome humano,
 * sem foreign / sem link / sem spam.
 *
 * Isto CONTRADIZ o requisito: "1 sinal estrutural isolado NÃO pode banir".
 *
 * O teste usa it.fails() para documentar o bug sem deixar a suíte vermelha.
 * Quando o double-counting for corrigido, trocar it.fails() por it().
 *
 * Inconsistência adicional: productMessage NÃO é coberto pela linha
 * 'mensagem-interativa', então productMessage isolado = 1 sinal (não bane),
 * enquanto buttonsMessage isolado = 2 sinais (bane).
 */
import { describe, it, expect, vi } from 'vitest';
import { evaluate } from '../../src/services/autoModEngine';

vi.mock('../../src/services/databaseService', () => ({
  getGroupMod: vi.fn(async () => ({
    antiestrangeiro: false,   // isolando o anti-bot
    remover: true,
    autolink: false,
    antispam: false,
    detectar: true,
    audit_only: false,
  })),
  banUser: vi.fn(async () => {}),
  recordMemberJoin: vi.fn(async () => {}),
  recordMemberRemove: vi.fn(async () => {}),
  recordMessageFingerprint: vi.fn(async () => {}),
  getRecentFingerprintCount: vi.fn(async () => 0),
  cleanupOldFingerprintEntries: vi.fn(async () => {}),
  cleanupOldJoinEntries: vi.fn(async () => {}),
}));

vi.mock('../../src/services/infractions', () => ({
  recordInfraction: vi.fn(async () => 1),
}));

const GROUP_JID = '120363419033272638@g.us';
// Remetente BRASILEIRO (não-foreign) com nome humano (não-suspeito)
const BR_JID = '5585988887777@s.whatsapp.net';

function makeCtx() {
  return {
    sock: {},
    userId: '558581344211@s.whatsapp.net',
    groupName: 'Figurinhas/Stickers',
    getChat: vi.fn(async () => ({ participants: [], id: GROUP_JID, subject: 'Figurinhas/Stickers' })),
    sendMessage: vi.fn(async () => ({ id: 'sent-1' })),
    removeParticipant: vi.fn(async () => {}),
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

describe('AntiBot — double-counting (bug documentado)', () => {
  it.fails(
    'buttonsMessage isolado (BR + nome humano, sem foreign/link/spam) NÃO deveria banir',
    async () => {
      const msg: any = {
        key: { id: 'msg-bot-1', fromMe: false, remoteJid: GROUP_JID, participant: BR_JID },
        message: {
          buttonsMessage: {
            contentText: 'Clique aqui',
            buttons: [{ buttonId: '1', buttonText: { displayText: 'OK' } }],
          },
        },
        messageTimestamp: Date.now(),
      };

      const result = await evaluate(msg, makeCtx() as any, GROUP_JID, BR_JID, 'João Silva');

      // Comportamento DESEJADO: 1 sinal estrutural não atinge threshold >=2
      expect(result.acted).toBe(false);
      expect(result.reason).not.toContain('antibot');
    },
  );

  it(
    'productMessage isolado NÃO bane (1 sinal) — inconsistente com buttonsMessage',
    async () => {
      const msg: any = {
        key: { id: 'msg-bot-2', fromMe: false, remoteJid: GROUP_JID, participant: BR_JID },
        message: {
          productMessage: { product: { productId: '123' }, businessOwnerJid: BR_JID },
        },
        messageTimestamp: Date.now(),
      };

      const result = await evaluate(msg, makeCtx() as any, GROUP_JID, BR_JID, 'João Silva');
      // productMessage NÃO está na linha 'mensagem-interativa' → 1 sinal → não bane.
      // Isto É o comportamento correto; o bug é buttonsMessage gerar 2 sinais.
      expect(result.acted).toBe(false);
    },
  );
});
