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
function ensureDir(): void {
  try {
    if (!fs.existsSync(CAPTURE_DIR)) fs.mkdirSync(CAPTURE_DIR, { recursive: true });
  } catch { /* ignorar */ }
}

/**
 * Anexa uma entrada ao JSONL. Nunca lança.
 * @returns true se gravou, false se falhou.
 */
export function appendCapture(entry: Record<string, any>): boolean {
  try {
    ensureDir();
    const line = JSON.stringify(sanitize(entry)) + '\n';
    fs.appendFileSync(CAPTURE_FILE, line, 'utf-8');
    return true;
  } catch {
    return false;
  }
}

/** Lê todas as entradas do JSONL. Nunca lança. */
export function readCaptures(): Array<Record<string, any>> {
  try {
    if (!fs.existsSync(CAPTURE_FILE)) return [];
    const text = fs.readFileSync(CAPTURE_FILE, 'utf-8').trim();
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

export function getCaptureFile(): string {
  return CAPTURE_FILE;
}

export default { appendCapture, readCaptures, sanitize, getCaptureFile };
