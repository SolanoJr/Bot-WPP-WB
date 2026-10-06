/**
 * capture-store — persistência append-only de mensagens capturadas.
 *
 * Usado por:
 *   - BaileysMessageNormalizer (mensagens ao vivo do WhatsApp)
 *   - BaileysConnection (histórico via messaging-history.set)
 *   - TelegramAdapter / DiscordAdapter
 *   - testServer (/lab/messages, /lab/delete-message)
 *
 * Formato: JSONL (uma linha = um JSON). Append-only, tolerante a falha —
 * nunca lança para não derrubar o pipeline de mensagens.
 *
 * O dump é SANITIZADO: chaves de criptografia e buffers binários são removidos
 * (ver sanitize()).
 */

import fs from 'fs';
import path from 'path';

const CAPTURE_DIR = process.env.CAPTURE_DIR
  ? path.resolve(process.env.CAPTURE_DIR)
  : path.join(process.cwd(), 'laboratorio');
const CAPTURE_FILE = path.join(CAPTURE_DIR, 'captured-messages.jsonl');
const MAX_CACHED_MESSAGES = 5000;
const CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_PRUNE_INTERVAL_MS = 60 * 1000;

type CachedMessage = {
  capture: Record<string, any>;
  storedAt: number;
};

const messageCache = new Map<string, CachedMessage>();
let persistenceQueue: Promise<void> = Promise.resolve();
let lastCachePruneAt = 0;

/** Campos de payload que NUNCA devem ir para o dump (segredos/binários). */
const REDACTED_KEYS = new Set([
  'mediaKey', 'fileEncSha256', 'fileSha256', 'directPath', 'encHandle',
  'mediaKeyTimestamp', 'jpegThumbnail', 'thumbnailDirectPath', 'thumbnailSha256',
  'thumbnailEncSha256', 'scansSidecar', 'scanLengths', 'streamingSidecar',
  'url', 'encKey', 'iv', 'privateKey', 'keyPair', 'advSecretKey', 'signedIdentityKey',
]);

/**
 * Remove recursivamente buffers, chaves sensíveis e trunca strings longas.
 * Mantém a ESTRUTURA (nomes dos campos) — que é o que o AntiBot analisa.
 */
export function sanitize(value: any, depth: number = 0): any {
  if (depth > 12) return '[deep]';
  if (value === null || value === undefined) return value;

  // Buffer / Uint8Array → marcador de tamanho
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return `[buffer ${value.length}b]`;
  }
  if (typeof value === 'bigint') return String(value);
  if (typeof value !== 'object') {
    if (typeof value === 'string' && value.length > 2000) {
      return value.slice(0, 2000) + `…[+${value.length - 2000}]`;
    }
    return value;
  }
  if (Array.isArray(value)) {
    // Limita arrays grandes (ex: sections de listMessage, participants)
    const head = value.slice(0, 50).map(v => sanitize(v, depth + 1));
    if (value.length > 50) head.push(`[+${value.length - 50} itens]`);
    return head;
  }

  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(value)) {
    // Buffer ANTES da redação: informa o tamanho sem expor o conteúdo.
    if (Buffer.isBuffer(v) || v instanceof Uint8Array) {
      out[k] = `[buffer ${v.length}b]`;
      continue;
    }
    if (REDACTED_KEYS.has(k)) {
      out[k] = '[redacted]';
      continue;
    }
    out[k] = sanitize(v, depth + 1);
  }
  return out;
}

/** Garante que o diretório existe. */
function messageCacheKey(remoteJid: string, messageId: string): string {
  return JSON.stringify([remoteJid, messageId]);
}

function pruneMessageCache(now: number): void {
  if (now - lastCachePruneAt < CACHE_PRUNE_INTERVAL_MS) return;
  for (const [key, cached] of messageCache) {
    if (now - cached.storedAt > CACHE_TTL_MS) messageCache.delete(key);
  }
  lastCachePruneAt = now;
}

/**
 * Anexa uma entrada ao JSONL. Nunca lança.
 * @returns true se a captura foi sanitizada e enfileirada, false se falhou.
 */
export function appendCapture(entry: Record<string, any>): boolean {
  try {
    const safeEntry = sanitize(entry);
    const line = JSON.stringify(safeEntry) + '\n';
    const now = Date.now();

    if (safeEntry.source === 'messages.upsert' && safeEntry.messageId && safeEntry.remoteJid) {
      pruneMessageCache(now);
      const key = messageCacheKey(String(safeEntry.remoteJid), String(safeEntry.messageId));
      const capture = {
        source: safeEntry.source,
        messageId: String(safeEntry.messageId),
        remoteJid: String(safeEntry.remoteJid),
        key: safeEntry.key || safeEntry.rawPayloadSafe?.key || null,
      };
      messageCache.delete(key);
      messageCache.set(key, { capture, storedAt: now });
      while (messageCache.size > MAX_CACHED_MESSAGES) {
        const oldestKey = messageCache.keys().next().value;
        if (oldestKey === undefined) break;
        messageCache.delete(oldestKey);
      }
    }

    persistenceQueue = persistenceQueue.then(async () => {
      await fs.promises.mkdir(CAPTURE_DIR, { recursive: true });
      await fs.promises.appendFile(CAPTURE_FILE, line, 'utf-8');
    }).catch(() => { /* captura é best-effort */ });
    return true;
  } catch {
    return false;
  }
}

/** Lê todas as entradas persistidas do JSONL sem bloquear o event loop. */
export async function readCaptures(): Promise<Array<Record<string, any>>> {
  try {
    await persistenceQueue;
    const text = (await fs.promises.readFile(CAPTURE_FILE, 'utf-8')).trim();
    if (!text) return [];
    return text
      .split('\n')
      .filter(Boolean)
      .map((l: string) => { try { return JSON.parse(l); } catch { return null; } })
      .filter((r: any): r is Record<string, any> => r != null);
  } catch {
    return [];
  }
}

export function findMessageCapture(remoteJid: string, messageId: string): Record<string, any> | null {
  const key = messageCacheKey(remoteJid, messageId);
  const cached = messageCache.get(key);
  if (!cached) return null;

  if (Date.now() - cached.storedAt > CACHE_TTL_MS) {
    messageCache.delete(key);
    return null;
  }

  messageCache.delete(key);
  messageCache.set(key, cached);
  return cached.capture;
}

export function getCaptureFile(): string {
  return CAPTURE_FILE;
}

export default { appendCapture, readCaptures, findMessageCapture, sanitize, getCaptureFile };
