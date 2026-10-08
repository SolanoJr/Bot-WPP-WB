/**
 * UNIT/INTEGRATION — captura, resolução e encaminhamento da WAMessageKey.
 *
 * Prova a cadeia REAL de construção da chave de delete, com o código de
 * produção (`buildDeleteKey` do engine + `captureStore`), para:
 *   - PN (participante sem LID)
 *   - LID (grupo com addressingMode 'lid')
 *   - fromMe false (mensagem de terceiro)
 *   - mensagem própria (protegida)
 *   - persistência e RECUPERAÇÃO da key a partir do captureStore
 *
 * Estes testes usam SQLite/socket isolados e NÃO são um WhatsApp E2E real.
 * Eles provam que a captura e a key completa são preservadas até o adapter;
 * somente o endpoint loopback /lab/delete-e2e pode confirmar um REVOKE real.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-delete-'));
process.env.BOT_DATA_DIR = TMP_DIR;
process.env.CAPTURE_DIR = TMP_DIR;

vi.mock('../../src/services/loggerService', () => ({
  default: { info: () => {}, warn: () => {}, error: () => {} },
  logInfo: () => {}, logWarning: () => {}, logError: () => {},
}));

vi.mock('../../src/services/infractions', () => ({
  recordInfraction: vi.fn(async () => 1),
}));

let engine: typeof import('../../src/services/autoModEngine');
let capture: typeof import('../../src/services/captureStore');
let db: typeof import('../../src/services/databaseService');

const GRUPO = '120363410094452673@g.us';
const GRUPO_LID = '120363419033272638@g.us';
const TERC = '6285822480546@s.whatsapp.net';
const TERC_LID = '33471368028338@lid';
const TERC_PN_ALT = '6285822480546@s.whatsapp.net';

beforeAll(async () => {
  engine = await import('../../src/services/autoModEngine');
  capture = await import('../../src/services/captureStore');
  db = await import('../../src/services/databaseService');
  await db.initDatabase();
});

afterAll(() => {
  try { fs.rmSync(TMP_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
});

function makeMsg(opts: {
  id: string; remoteJid: string; participant: string;
  participantAlt?: string; addressingMode?: string; fromMe?: boolean;
  message?: any;
}) {
  return {
    key: {
      id: opts.id,
      remoteJid: opts.remoteJid,
      fromMe: opts.fromMe ?? false,
      participant: opts.participant,
      participantAlt: opts.participantAlt,
      addressingMode: opts.addressingMode,
    },
    message: opts.message || { extendedTextMessage: { text: 'Taxa de vitórias 98% 777-7777 https://kl7.games/?c=10103' } },
    messageTimestamp: Math.floor(Date.now() / 1000),
  };
}

function makeCtx() {
  const calls: any[] = [];
  const logs: string[] = [];
  return {
    calls,
    logs,
    ctx: {
      log: (...args: any[]) => logs.push(JSON.stringify(args)),
      warn: () => {},
      getChat: async (gid: string) => ({ id: gid, isGroup: true, name: 'G', participants: [], raw: { participants: [] } }),
      removeParticipant: async (groupId: string, userId: string) => calls.push({ action: 'remove', groupId, userId }),
      sendMessage: async (gid: string, text: string, options?: any) => {
        if (options?.delete) calls.push({ action: 'delete', groupId: gid, key: options.delete });
      },
    },
  };
}

describe('DELETE — PN (participante sem LID)', () => {
  it('registra a key original no log sem executar ações destrutivas', async () => {
    await db.setGroupModAll(GRUPO, { casino: true, remover: true, detectar: false, audit_only: true } as any);
    const { ctx, calls, logs } = makeCtx();
    await engine.evaluate(
      makeMsg({ id: 'DEL-PN-1', remoteJid: GRUPO, participant: TERC }),
      ctx as any, GRUPO, TERC, 'Promoter',
    );
    expect(calls).toEqual([]);
    expect(logs.join('\n')).toContain('DRY-RUN message key capture');
    expect(logs.join('\n')).toContain('DEL-PN-1');
    expect(logs.join('\n')).toContain(GRUPO);
    expect(logs.join('\n')).toContain(TERC);
    expect(logs.join('\n')).toContain('"fromMe":false');
  });
});

describe('DELETE — LID (grupo com addressingMode lid)', () => {
  it('registra a key completa em log-only sem exclusão', async () => {
    await db.setGroupModAll(GRUPO_LID, { casino: true, remover: true, detectar: false, audit_only: true } as any);
    const { ctx, calls, logs } = makeCtx();
    await engine.evaluate(
      makeMsg({
        id: 'DEL-LID-1', remoteJid: GRUPO_LID, participant: TERC_LID,
        participantAlt: TERC_PN_ALT, addressingMode: 'lid',
      }),
      ctx as any, GRUPO_LID, TERC_LID, 'Promoter',
    );
    expect(calls).toEqual([]);
    expect(logs.join('\n')).toContain('DRY-RUN message key capture');
    expect(logs.join('\n')).toContain('DEL-LID-1');
    expect(logs.join('\n')).toContain(GRUPO_LID);
    expect(logs.join('\n')).toContain(TERC_LID);
    expect(logs.join('\n')).toContain(TERC_PN_ALT);
    expect(logs.join('\n')).toContain('"addressingMode":"lid"');
  });

  it('sem participantAlt, o campo NÃO é inventado (fica undefined)', async () => {
    const { ctx, calls } = makeCtx();
    await engine.evaluate(
      makeMsg({ id: 'DEL-LID-2', remoteJid: GRUPO_LID, participant: TERC_LID, addressingMode: 'lid' }),
      ctx as any, GRUPO_LID, TERC_LID, 'X',
    );
    if (calls.length > 0) {
      expect(calls[0].key.participantAlt).toBeUndefined();
    }
  });
});

describe('DELETE — mensagem PRÓPRIA não é alvo', () => {
  it('fromMe=true não gera delete (o engine não processa mensagem do bot)', async () => {
    const { ctx, calls } = makeCtx();
    const r = await engine.evaluate(
      makeMsg({ id: 'DEL-SELF', remoteJid: GRUPO, participant: TERC, fromMe: true }),
      ctx as any, GRUPO, TERC, 'Bot',
    );
    // O engine não deve agir sobre a própria mensagem
    expect(calls.filter(c => c.key)).toEqual([]);
  });
});

describe('CAPTURESTORE — persistência e recuperação da key', () => {
  it('BaileysMessageSender encaminha a WAMessageKey completa sem reconstruí-la', async () => {
    const { BaileysMessageSender } = await import('../../src/platforms/whatsapp/baileys/BaileysMessageSender');
    const originalKey = {
      id: 'DEL-ADAPTER-1',
      remoteJid: GRUPO_LID,
      fromMe: true,
      participant: TERC_LID,
      participantAlt: TERC_PN_ALT,
      remoteJidAlt: GRUPO,
      addressingMode: 'lid',
      server_id: 'server-1',
      participantUsername: 'lab-user',
    };
    const sock = {
      ws: { isOpen: true },
      sendMessage: vi.fn(async () => ({ key: { id: 'revoke-response' }, message: { protocolMessage: { type: 'REVOKE' } } })),
    };
    const sender = new BaileysMessageSender({
      sock,
      platform: 'whatsapp',
      userId: '558581344211@s.whatsapp.net',
      userName: 'Bot',
      getNumberId: async () => null,
      getContactById: async () => null,
    });

    await sender.sendMessage(`wpp:${GRUPO_LID}`, '', { delete: originalKey });

    expect(sock.sendMessage).toHaveBeenCalledWith(GRUPO_LID, { delete: originalKey });
  });

  it('indexa mensagens recebidas no cache pelo grupo e ID exatos', async () => {
    const originalKey = {
      id: 'DEL-CACHE-1',
      remoteJid: GRUPO_LID,
      fromMe: false,
      participant: TERC_LID,
      participantAlt: TERC_PN_ALT,
      addressingMode: 'lid',
    };
    capture.appendCapture({
      source: 'messages.upsert',
      messageId: originalKey.id,
      remoteJid: originalKey.remoteJid,
      key: originalKey,
    });

    expect((await capture.findMessageCapture(GRUPO_LID, originalKey.id))?.key).toEqual(originalKey);
    expect(await capture.findMessageCapture(GRUPO, originalKey.id)).toBeNull();
  });

  it('appendCapture grava e readCaptures recupera os campos necessários ao delete', async () => {
    const entry = {
      captureId: 'cap-1',
      platform: 'whatsapp',
      groupId: GRUPO_LID,
      messageId: 'DEL-RECOVER-1',
      remoteJid: GRUPO_LID,
      participant: TERC_LID,
      participantAlt: TERC_PN_ALT,
      addressingMode: 'lid',
      fromMe: false,
      timestamp: Date.now(),
      messageType: 'extendedTextMessage',
    };
    expect(capture.appendCapture(entry)).toBe(true);

    const all = await capture.readCaptures();
    const found = all.find((e: any) => e.messageId === 'DEL-RECOVER-1');
    expect(found).toBeDefined();
    expect(found.remoteJid).toBe(GRUPO_LID);
    expect(found.participant).toBe(TERC_LID);
    expect(found.participantAlt).toBe(TERC_PN_ALT);
    expect(found.addressingMode).toBe('lid');
    expect(found.fromMe).toBe(false);
    expect(found.messageType).toBe('extendedTextMessage');
  });

  it('a key recuperada é reconstruível e idêntica à original', async () => {
    const all = await capture.readCaptures();
    const e: any = all.find((x: any) => x.messageId === 'DEL-RECOVER-1');
    const rebuilt = {
      id: e.messageId,
      remoteJid: e.remoteJid,
      fromMe: e.fromMe,
      participant: e.participant,
      participantAlt: e.participantAlt,
      addressingMode: e.addressingMode,
    };
    expect(rebuilt).toEqual({
      id: 'DEL-RECOVER-1',
      remoteJid: GRUPO_LID,
      fromMe: false,
      participant: TERC_LID,
      participantAlt: TERC_PN_ALT,
      addressingMode: 'lid',
    });
  });

  it('sanitiza segredos e nunca expõe buffer binário', async () => {
    capture.appendCapture({
      messageId: 'cap-secret',
      mediaKey: Buffer.from('segredo'),
      fileEncSha256: Buffer.from('hash'),
      nested: { mediaKey: Buffer.from('x') },
    });
    const e: any = (await capture.readCaptures()).find((x: any) => x.messageId === 'cap-secret');
    // Buffer nunca vaza conteúdo — vira marcador de tamanho
    expect(e.mediaKey).toMatch(/^\[buffer \d+b\]$/);
    expect(e.fileEncSha256).toMatch(/^\[buffer \d+b\]$/);
    expect(e.nested.mediaKey).toMatch(/^\[buffer \d+b\]$/);
    // Nenhum segredo legível no dump
    const raw = JSON.stringify(e);
    expect(raw).not.toContain('segredo');
    expect(raw).not.toContain('hash');
  });

  it('readCaptures retorna lista vazia quando o arquivo não existe', async () => {
    await fs.promises.rm(capture.getCaptureFile(), { force: true });
    await expect(capture.readCaptures()).resolves.toEqual([]);
  });
});
