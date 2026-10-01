/**
 * Testes do handler de histórico (messaging-history.set) + capture-store.
 *
 * Motivo: o Baileys v7 NÃO tem store de mensagens. O histórico só chega pelo
 * evento 'messaging-history.set'. Sem handler, o blob PDO era baixado,
 * decriptado e DESCARTADO — tornando mensagens passadas irrecuperáveis.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-'));
  process.env.CAPTURE_DIR = tmpDir;
});

afterEach(() => {
  delete process.env.CAPTURE_DIR;
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
});

async function loadStore() {
  // CAPTURE_FILE é resolvido no load do módulo → limpar o cache para que cada
  // teste use o seu próprio CAPTURE_DIR.
  const { vi } = await import('vitest');
  vi.resetModules();
  return await import('../../laboratorio/capture-store');
}

describe('capture-store — sanitização', () => {
  it('remove buffers e converte para marcador de tamanho', async () => {
    const { sanitize } = await loadStore();
    const out = sanitize({ jpegThumbnail: Buffer.from([1, 2, 3, 4]) });
    expect(out.jpegThumbnail).toBe('[buffer 4b]');
  });

  it('redige chaves de criptografia conhecidas', async () => {
    const { sanitize } = await loadStore();
    const out = sanitize({ mediaKey: 'abc', fileSha256: 'def', url: 'https://x', caption: 'texto' });
    expect(out.mediaKey).toBe('[redacted]');
    expect(out.fileSha256).toBe('[redacted]');
    expect(out.url).toBe('[redacted]');
    expect(out.caption).toBe('texto');       // conteúdo preservado
  });

  it('PRESERVA a estrutura do payload (o que o AntiBot analisa)', async () => {
    const { sanitize } = await loadStore();
    const out = sanitize({
      buttonsMessage: { contentText: 'Clique', buttons: [{ buttonId: '1' }] },
    });
    expect(Object.keys(out)).toEqual(['buttonsMessage']);
    expect(out.buttonsMessage.contentText).toBe('Clique');
    expect(out.buttonsMessage.buttons[0].buttonId).toBe('1');
  });

  it('trunca strings longas', async () => {
    const { sanitize } = await loadStore();
    const out = sanitize({ text: 'x'.repeat(3000) });
    expect(out.text.length).toBeLessThan(2100);
    expect(out.text).toContain('…[+');
  });

  it('limita arrays grandes', async () => {
    const { sanitize } = await loadStore();
    const out = sanitize({ arr: Array.from({ length: 120 }, (_, i) => i) });
    expect(out.arr.length).toBe(51);
    expect(out.arr[50]).toContain('+70');
  });

  it('converte BigInt para string (messageTimestamp)', async () => {
    const { sanitize } = await loadStore();
    const out = sanitize({ messageTimestamp: BigInt(1790777567) });
    expect(out.messageTimestamp).toBe('1790777567');
  });
});

describe('capture-store — append/read', () => {
  it('grava e lê de volta', async () => {
    const { appendCapture, readCaptures } = await loadStore();
    expect(appendCapture({ messageId: 'A1', groupId: 'g@g.us' })).toBe(true);
    const all = readCaptures();
    expect(all.length).toBe(1);
    expect(all[0].messageId).toBe('A1');
  });

  it('é append-only (não sobrescreve)', async () => {
    const { appendCapture, readCaptures } = await loadStore();
    appendCapture({ messageId: 'A' });
    appendCapture({ messageId: 'B' });
    appendCapture({ messageId: 'C' });
    expect(readCaptures().map(r => r.messageId)).toEqual(['A', 'B', 'C']);
  });

  it('linha corrompida não quebra a leitura', async () => {
    const { appendCapture, readCaptures, getCaptureFile } = await loadStore();
    appendCapture({ messageId: 'OK' });
    fs.appendFileSync(getCaptureFile(), '{lixo nao json\n');
    appendCapture({ messageId: 'OK2' });
    const all = readCaptures();
    expect(all.map(r => r.messageId)).toEqual(['OK', 'OK2']);
  });
});

describe('handler messaging-history.set — persistência do payload real', () => {
  /** Réplica do corpo do handler em BaileysConnection.ts */
  async function handleHistorySet(event: any) {
    const { appendCapture } = await loadStore();
    const msgs: any[] = event?.messages || [];
    if (!msgs.length) return 0;
    let saved = 0;
    for (const m of msgs) {
      const key = m?.key || {};
      const remoteJid = key.remoteJid || '';
      const isGroup = remoteJid.endsWith('@g.us');
      const messageObj = m?.message || {};
      const messageType = Object.keys(messageObj)[0] || 'empty';
      appendCapture({
        captureId: `hist-${key.id || 'noid'}-${Date.now()}`,
        capturedAt: new Date().toISOString(),
        source: 'messaging-history.set',
        syncType: event?.syncType ?? null,
        peerDataRequestSessionId: event?.peerDataRequestSessionId ?? null,
        groupId: isGroup ? remoteJid : '',
        messageId: key.id || '',
        remoteJid,
        participant: key.participant || '',
        participantAlt: key.participantAlt || '',
        addressingMode: key.addressingMode || '',
        fromMe: !!key.fromMe,
        timestamp: Number(m?.messageTimestamp || 0) * 1000 || Date.now(),
        messageType,
        contentType: messageType,
        senderJid: key.participant || remoteJid,
        isGroup,
        pushName: m?.pushName || '',
        size: 0,
        rawPayloadSafe: {
          key: { id: key.id, remoteJid, fromMe: !!key.fromMe, participant: key.participant,
                 participantAlt: key.participantAlt, addressingMode: key.addressingMode },
          message: messageObj,
          messageTimestamp: m?.messageTimestamp,
          pushName: m?.pushName,
          status: m?.status,
        },
      });
      saved++;
    }
    return saved;
  }

  it('persiste uma mensagem de grupo com o payload ESTRUTURAL completo', async () => {
    const saved = await handleHistorySet({
      syncType: 'ON_DEMAND',
      peerDataRequestSessionId: '3EB02B9CFED4280BC81CAD',
      messages: [{
        key: { id: '3EB0REAL', remoteJid: '120363419033272638@g.us', fromMe: false,
               participant: '33471368028338@lid', addressingMode: 'lid' },
        message: { interactiveMessage: { body: { text: 'Alta taxa de vitórias kl7.games' },
                   nativeFlowMessage: { buttons: [{ name: 'cta_url' }] } } },
        messageTimestamp: 1790777567,
        pushName: '~ Daniel Taylor',
      }],
    });
    expect(saved).toBe(1);

    const { readCaptures } = await loadStore();
    const [e] = readCaptures();
    expect(e.messageId).toBe('3EB0REAL');
    expect(e.groupId).toBe('120363419033272638@g.us');
    expect(e.participant).toBe('33471368028338@lid');
    expect(e.messageType).toBe('interactiveMessage');   // ← o tipo REAL
    expect(e.source).toBe('messaging-history.set');
    expect(e.pushName).toBe('~ Daniel Taylor');
    expect(e.addressingMode).toBe('lid');
    // O payload estrutural sobrevive → permite reavaliar com evaluate()
    expect(e.rawPayloadSafe.message.interactiveMessage).toBeDefined();
    expect(e.rawPayloadSafe.message.interactiveMessage.body.text).toContain('kl7.games');
  });

  it('lida com todos os tipos estruturais relevantes', async () => {
    const types = ['buttonsMessage', 'listMessage', 'templateMessage', 'interactiveMessage', 'imageMessage', 'conversation'];
    await handleHistorySet({
      messages: types.map((t, i) => ({
        key: { id: `id-${i}`, remoteJid: 'g@g.us', fromMe: false, participant: 'p@lid' },
        message: t === 'conversation' ? { conversation: 'oi' } : { [t]: { x: 1 } },
        messageTimestamp: 1,
      })),
    });
    const { readCaptures } = await loadStore();
    expect(readCaptures().map(e => e.messageType)).toEqual(types);
  });

  it('não grava nada quando o evento vem vazio', async () => {
    expect(await handleHistorySet({ messages: [] })).toBe(0);
    expect(await handleHistorySet({})).toBe(0);
    const { readCaptures } = await loadStore();
    expect(readCaptures().length).toBe(0);
  });

  it('ignora chaves de criptografia no dump', async () => {
    await handleHistorySet({
      messages: [{
        key: { id: 'X', remoteJid: 'g@g.us', fromMe: false },
        message: { imageMessage: { caption: 'spam', mediaKey: 'SEGREDO', jpegThumbnail: Buffer.from([1,2]) } },
        messageTimestamp: 1,
      }],
    });
    const { readCaptures } = await loadStore();
    const e = readCaptures()[0];
    expect(e.rawPayloadSafe.message.imageMessage.caption).toBe('spam');
    expect(e.rawPayloadSafe.message.imageMessage.mediaKey).toBe('[redacted]');
    expect(e.rawPayloadSafe.message.imageMessage.jpegThumbnail).toBe('[buffer 2b]');
    // Nenhum segredo no arquivo cru
    const raw = fs.readFileSync(path.join(tmpDir, 'captured-messages.jsonl'), 'utf-8');
    expect(raw).not.toContain('SEGREDO');
  });
});

describe('evaluate() reprocessa o payload capturado do histórico', () => {
  it('a mensagem persistida gera os MESMOS sinais do evaluate real', async () => {
    await (async () => {
      const { appendCapture } = await loadStore();
      appendCapture({
        source: 'messaging-history.set',
        messageId: '3EB0REAL',
        groupId: '120363419033272638@g.us',
        participant: '33471368028338@lid',
        messageType: 'interactiveMessage',
        rawPayloadSafe: {
          key: { id: '3EB0REAL', remoteJid: '120363419033272638@g.us', fromMe: false, participant: '33471368028338@lid' },
          message: { interactiveMessage: { body: { text: 'Alta taxa de vitórias kl7.games' } } },
          messageTimestamp: 1790777567,
        },
      });
    })();

    const { readCaptures } = await loadStore();
    const entry = readCaptures().find(e => e.messageId === '3EB0REAL')!;
    const { extractAntiBotSignals, isForeignNumber, containsSpamKeyword } =
      await import('../../src/services/autoModEngine');

    // Reconstrói a WAMessage a partir do dump
    const waMessage: any = {
      key: entry.rawPayloadSafe.key,
      message: entry.rawPayloadSafe.message,
      messageTimestamp: entry.rawPayloadSafe.messageTimestamp,
    };

    expect(extractAntiBotSignals(waMessage)).toEqual(['interactiveMessage']);
    expect(isForeignNumber(entry.participant)).toBe(true);
    expect(containsSpamKeyword(entry.rawPayloadSafe.message.interactiveMessage.body.text)).toBe(true);
  });
});
