/**
 * 🧹 Cleanup Service - Limpeza Automática
 * 
 * Gerencia limpeza periódica de:
 * - Logs antigos (>7 dias)
 * - Cache de fingerprints (>1h)
 * - Sessões WhatsApp antigas (>30 dias sem uso)
 * - Arquivos temporários
 */

import fs from 'fs/promises';
import path from 'path';
import logger from './loggerService';
import { cleanupOldFingerprintEntries, cleanupOldJoinEntries, cleanupOldNewsHistory, checkpointWal, upsertGroupMeta, listKnownGroupJids } from './databaseService';

export interface CleanupStats {
  logsDeleted: number;
  fingerprintsDeleted: number;
  joinEntriesDeleted: number;
  newsHistoryDeleted: number;
  groupsRefreshed: number;
  tempFilesDeleted: number;
  bytesFreed: number;
  duration: number;
}

export class CleanupService {
  private isRunning = false;
  private lastRun?: Date;
  private stats?: CleanupStats;

  /**
   * Executa limpeza completa
   */
  async runCleanup(): Promise<CleanupStats> {
    if (this.isRunning) {
      logger.warn('[Cleanup] Limpeza já em execução, aguardando...');
      throw new Error('Cleanup already running');
    }

    this.isRunning = true;
    const startTime = Date.now();

    logger.info('[Cleanup] 🧹 Iniciando limpeza automática...');

    const stats: CleanupStats = {
      logsDeleted: 0,
      fingerprintsDeleted: 0,
      joinEntriesDeleted: 0,
      newsHistoryDeleted: 0,
      groupsRefreshed: 0,
      tempFilesDeleted: 0,
      bytesFreed: 0,
      duration: 0
    };

    try {
      // 1. Limpar logs antigos (>7 dias)
      const logsStats = await this.cleanupOldLogs(7);
      stats.logsDeleted = logsStats.filesDeleted;
      stats.bytesFreed += logsStats.bytesFreed;

      // 2. Limpar fingerprints antigos (>1 hora no DB)
      await cleanupOldFingerprintEntries(3600); // 1h
      stats.fingerprintsDeleted = 1; // Não temos count exato, marcar como feito

      // 3. Limpar join entries antigos (>30 dias no DB)
      await cleanupOldJoinEntries(2592000); // 30 dias
      stats.joinEntriesDeleted = 1; // Não temos count exato, marcar como feito

      // 3.5 Limpar histórico de notícias (INC-006: dedup — a tabela é
      // janela de 7 dias, senão o filtro do prompt cresce sem fim)
      stats.newsHistoryDeleted = await cleanupOldNewsHistory(7);

      // 3.6 INC-009: atualizar meta (nome/descrição) dos grupos conhecidos.
      // Best-effort — falha de plataforma/grupo não aborta a limpeza.
      try {
        stats.groupsRefreshed = await refreshGroupMetas();
      } catch (e: any) {
        logger.warn('[Cleanup] refreshGroupMetas falhou (não aborta)', { error: e?.message });
      }

      // 4. Checkpoint do WAL — garante que o arquivo principal em disco reflita
      // o estado real. Sem isso o .db fica defasado e um backup só do .db perde
      // tudo que ainda está no -wal. Best-effort: falha não aborta a limpeza.
      try {
        await checkpointWal();
      } catch (e: any) {
        logger.warn('[Cleanup] checkpoint do WAL falhou (não bloqueia)', { err: String(e?.message || e) });
      }

      // 5. Limpar arquivos temporários
      const tempStats = await this.cleanupTempFiles();
      stats.tempFilesDeleted = tempStats.filesDeleted;
      stats.bytesFreed += tempStats.bytesFreed;

      stats.duration = Date.now() - startTime;
      this.lastRun = new Date();
      this.stats = stats;

      logger.info('[Cleanup] ✅ Limpeza concluída', {
        logsDeleted: stats.logsDeleted,
        tempFilesDeleted: stats.tempFilesDeleted,
        bytesFreed: `${(stats.bytesFreed / 1024 / 1024).toFixed(2)} MB`,
        duration: `${stats.duration}ms`
      });

      return stats;
    } catch (error: any) {
      logger.error('[Cleanup] Erro durante limpeza', { error: error?.message });
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Limpa logs antigos (>X dias)
   */
  private async cleanupOldLogs(maxAgeDays: number): Promise<{ filesDeleted: number; bytesFreed: number }> {
    const logsDir = path.join(process.cwd(), 'logs');
    let filesDeleted = 0;
    let bytesFreed = 0;

    try {
      const exists = await fs.access(logsDir).then(() => true).catch(() => false);
      if (!exists) return { filesDeleted, bytesFreed };

      const files = await fs.readdir(logsDir);
      const maxAge = Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000);

      for (const file of files) {
        try {
          // Ignorar arquivos ativos (combined.log, error.log, etc sem data)
          if (!file.match(/\d{4}-\d{2}-\d{2}/)) continue;

          const filePath = path.join(logsDir, file);
          const stat = await fs.stat(filePath);

          if (stat.mtimeMs < maxAge) {
            bytesFreed += stat.size;
            await fs.unlink(filePath);
            filesDeleted++;
            logger.debug('[Cleanup] Log deletado', { file, age: `${maxAgeDays}d+` });
          }
        } catch (err: any) {
          logger.warn('[Cleanup] Erro ao deletar log', { file, error: err?.message });
        }
      }

      if (filesDeleted > 0) {
        logger.info('[Cleanup] Logs antigos removidos', {
          count: filesDeleted,
          freed: `${(bytesFreed / 1024 / 1024).toFixed(2)} MB`
        });
      }
    } catch (error: any) {
      logger.error('[Cleanup] Erro ao limpar logs', { error: error?.message });
    }

    return { filesDeleted, bytesFreed };
  }

  /**
   * Limpa arquivos temporários (.tmp, cache)
   */
  private async cleanupTempFiles(): Promise<{ filesDeleted: number; bytesFreed: number }> {
    let filesDeleted = 0;
    let bytesFreed = 0;

    // Limpar .wwebjs_cache (se existir)
    const cachePath = path.join(process.cwd(), '.wwebjs_cache');
    try {
      const exists = await fs.access(cachePath).then(() => true).catch(() => false);
      if (exists) {
        const stat = await fs.stat(cachePath);
        if (stat.isDirectory()) {
          const files = await fs.readdir(cachePath);
          for (const file of files) {
            try {
              const filePath = path.join(cachePath, file);
              const fileStat = await fs.stat(filePath);
              bytesFreed += fileStat.size;
              await fs.unlink(filePath);
              filesDeleted++;
            } catch (err) {
              // Ignorar erros individuais
            }
          }
        }
      }
    } catch (error: any) {
      // Cache pode não existir, ok
    }

    if (filesDeleted > 0) {
      logger.info('[Cleanup] Arquivos temp removidos', {
        count: filesDeleted,
        freed: `${(bytesFreed / 1024 / 1024).toFixed(2)} MB`
      });
    }

    return { filesDeleted, bytesFreed };
  }

  /**
   * Retorna estatísticas da última limpeza
   */
  getLastStats(): CleanupStats | null {
    return this.stats || null;
  }

  /**
   * Retorna timestamp da última execução
   */
  getLastRun(): Date | null {
    return this.lastRun || null;
  }

  /**
   * Verifica se limpeza está rodando
   */
  getIsRunning(): boolean {
    return this.isRunning;
  }
}

// Singleton
export const cleanupService = new CleanupService();

/**
 * INC-009: atualiza nome/descrição dos grupos conhecidos em
 * community_groups (best-effort). Fonte: getChat do adapter WhatsApp —
 * a mesma que o /lab/groups usa na listagem. Roda dentro do runCleanup
 * (boot + 6h) e não toca no hot path de mensagens.
 */
export async function refreshGroupMetas(): Promise<number> {
  const jids = await listKnownGroupJids();
  let updated = 0;
  try {
    const { PlatformManager } = await import('../platforms/PlatformManager.js');
    const adapter: any = PlatformManager.getInstance().getAdapter('whatsapp');
    if (!adapter?.client?.getChat) return 0;
    for (const jid of jids) {
      if (!jid.endsWith('@g.us')) continue;
      try {
        const chat = await adapter.client.getChat(jid);
        if (chat?.id) {
          await upsertGroupMeta(chat.id, chat.name ?? null, chat.description ?? null);
          updated++;
        }
      } catch { /* grupo pode ter saído — meta antiga permanece */ }
    }
  } catch { /* plataforma fora do ar — meta fica como está */ }
  return updated;
}

/**
 * Inicia limpeza periódica (a cada 6 horas)
 */
export function startPeriodicCleanup(intervalMs: number = 6 * 60 * 60 * 1000): NodeJS.Timeout {
  logger.info('[Cleanup] Limpeza periódica agendada', {
    interval: `${intervalMs / 1000 / 60 / 60}h`
  });

  // Executar imediatamente (após 1min de startup)
  setTimeout(() => {
    cleanupService.runCleanup().catch(err => {
      logger.error('[Cleanup] Erro na limpeza inicial', { error: err?.message });
    });
  }, 60000);

  // Executar periodicamente
  return setInterval(() => {
    cleanupService.runCleanup().catch(err => {
      logger.error('[Cleanup] Erro na limpeza periódica', { error: err?.message });
    });
  }, intervalMs);
}
