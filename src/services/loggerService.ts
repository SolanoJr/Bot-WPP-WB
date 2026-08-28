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

/**
 * Registra execução de comando com resultado
 */
export function logCommand(opts: {
  command: string;
  platform: string;
  userId: string;
  chatId: string;
  success: boolean;
  durationMs?: number;
  error?: string;
  isAdmin?: boolean;
  isMaster?: boolean;
}): void {
  const emoji = opts.success ? '✅' : '❌';
  const permInfo = opts.isMaster ? '[MASTER]' : opts.isAdmin ? '[ADMIN]' : '[USER]';
  const timing = opts.durationMs ? ` (${opts.durationMs}ms)` : '';
  logger.info(`${emoji} [CMD:${opts.platform}] ${permInfo} $${opts.command} | user=${opts.userId} | ${opts.success ? `OK${timing}` : 'ERRO: ' + opts.error}`);
  commandLogger.info('command_executed', opts);
}

/**
 * Registra mudança de status de plataforma
 */
export function logPlatformStatus(platform: string, status: 'online' | 'offline' | 'error', detail?: string): void {
  const emoji = status === 'online' ? '🟢' : status === 'offline' ? '🔴' : '🟡';
  logger.info(`${emoji} [PLATFORM] ${platform} → ${status}${detail ? ': ' + detail : ''}`);
  platformLogger.info('platform_status', { platform, status, detail });
}

/**
 * Registra erro com contexto completo
 */
export function logError(context: string, error: any, extra?: Record<string, any>): void {
  const msg = error?.message || String(error);
  const stack = error?.stack;
  logger.error(`❌ [${context}] ${msg}${extra ? ' | ' + JSON.stringify(extra) : ''}`);
  if (stack) logger.error(`   Stack: ${stack.split('\n')[1]?.trim() ?? ''}`);
}

export function logInfo(message: string, meta: any = {}): void {
  logger.info(`${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`);
}

export function logWarning(message: string, meta: any = {}): void {
  logger.warn(`${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`);
}

/**
 * Health check de todas as plataformas ativas
 */
export function logHealthCheck(platforms: Record<string, { online: boolean; uptime?: number; lastError?: string }>): void {
  const lines = Object.entries(platforms).map(([p, s]) => {
    const icon = s.online ? '🟢' : '🔴';
    const uptime = s.uptime ? ` uptime=${Math.floor(s.uptime / 60)}min` : '';
    const err = s.lastError ? ` err=${s.lastError}` : '';
    return `${icon} ${p}${uptime}${err}`;
  });
  logger.info(`[HEALTH] ${lines.join(' | ')}`);
}

export default logger;
