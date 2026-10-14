/**
 * 📋 WarriorBlack - Logger Service
 *
 * Logger Winston com suporte a logs estruturados de:
 * - Comandos executados (sucesso/erro) por plataforma
 * - Status das plataformas (online/offline)
 * - Erros com contexto completo
 */

import winston from 'winston';
import path from 'path';
import fs from 'fs';

const LOG_DIR = 'logs';

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} [${level.toUpperCase()}]: ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'error.log'),
      level: 'error',
    }),
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'combined.log'),
    }),
  ],
});

// Logger estruturado para comandos (JSONL para fácil parsing)
const commandLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'commands.jsonl'),
    }),
  ],
});

// Logger estruturado para status das plataformas
const platformLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'platforms.jsonl'),
    }),
  ],
});

const REDACTION_PATTERNS: Array<[RegExp, string]> = [
  // ORDEM IMPORTA: JID primeiro, senão "5588998314322@s.whatsapp.net"
  // vira "[REDACTED_PHONE]@s.whatsapp.net" e o número escapa.
  [/\d+@(?:s\.whatsapp\.net|c\.us|g\.us|lid|newsletter|broadcast)/g, '[REDACTED_JID]'],
  // (\b não funciona como início: entre espaço e + não há word boundary,
  // o + fica órfão → +[REDACTED_PHONE]. Lookbehind de dígito resolve.)
  [/(?<![\d])(?:\+?55)?\d{2}(?:9\d{8}|[2-5]\d{7})\b/g, '[REDACTED_PHONE]'],
  [/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[REDACTED_EMAIL]'],
];

export function redactValue(value: string): string {
  let out = value;
  for (const [pattern, replacement] of REDACTION_PATTERNS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

/**
 * Registra erro com contexto completo
 */
export function logError(context: string, error: any, extra?: Record<string, any>): void {
  const msg = error?.message || String(error);
  const stack = error?.stack;
  logger.error(redactValue(`❌ [${context}] ${msg}${extra ? ' | ' + JSON.stringify(extra) : ''}`));
  if (stack) logger.error(`   Stack: ${stack.split('\n')[1]?.trim() ?? ''}`);
}

export function logInfo(message: string, meta: any = {}): void {
  logger.info(redactValue(`${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`));
}

export function logWarning(message: string, meta: any = {}): void {
  logger.warn(redactValue(`${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`));
}

export default logger;
