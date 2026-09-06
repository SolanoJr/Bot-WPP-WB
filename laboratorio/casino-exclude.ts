/**
 * laboratorio/casino-exclude.ts
 *
 * FASE 2: Tentativa de exclusão das mensagens de bot de cassino já
 * existentes no grupo "Figurinhas", usando SOMENTE a sessão/socket
 * principal do WarriorBlack.
 *
 * REGRAS:
 * - SOMENTE grupo Figurinhas (5585981344211-1772111940@g.us)
 * - SOMENTE remetente suspeito (1551234567890@c.us)
 * - NÃO apagar do WarriorBlack nem do SolanoJr.
 * - NÃO remover, NÃO banir, NÃO tocar em AutoMod
 * - Validar isProtectedTarget antes de cada delete
 * - Usar sendMessage(jid, '', {delete: {id, fromMe, participant, remoteJid}})
 *
 * Estratégias de localização (nesta ordem):
 * 1. Ler captured-messages.jsonl (capturas após a implementação da Parte 1)
 * 2. Tentar fetchMessageHistory via testServer com âncora de mensagem recente
 * 3. Se encontrar mensagens de 1551234567890@c.us com buttons/interactive,
 *    executar delete de cada uma individualmente
 */

import { isProtectedTarget } from '../src/services/permissions';
import logger from '../src/services/loggerService';
import fs from 'node:fs';
import path from 'node:path';

// ─── Configuração ──────────────────────────────────────────────────────────

const GROUP_JID = '5585981344211-1772111940@g.us';
const SUSPICIOUS_SENDER = '1551234567890@c.us';
const CAPTURE_FILE = path.join(process.cwd(), 'laboratorio', 'captured-messages.jsonl');
const RESULT_FILE = path.join(process.cwd(), 'laboratorio', 'casino-exclude-result.json');
const TEST_SERVER = 'http://127.0.0.1:3004';

// ─── Tipos ──────────────────────────────────────────────────────────────────

interface CapturedEntry {
  captureId: string;
  capturedAt: string;
  groupId: string;
  messageId: string;
  remoteJid: string;
  participant: string;
  fromMe: boolean;
  timestamp: number;
  messageType: string;
  contentType: string;
  senderJid: string;
  isGroup: boolean;
  pushName: string;
  size: number;
}

interface DeleteResult {
  attempted: boolean;
  messageId: string;
  senderJid: string;
  success: boolean;
  error?: string;
  timestamp: string;
}

// ─── HTTP helper ───────────────────────────────────────────────────────────

function httpPost(url: string, data: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const body = JSON.stringify(data);
    const req = (parsed.protocol === 'https:' ? require('https') : require('http'))
      .request({
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      }, (res: any) => {
        let responseBody = '';
        res.on('data', (chunk: any) => { responseBody += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(responseBody);
            if (res.statusCode !== 200) {
              reject(new Error(`HTTP ${res.statusCode}: ${parsed.error || 'unknown error'}`));
            } else {
              resolve(parsed);
            }
          } catch {
            reject(new Error(`HTTP ${res.statusCode}: cannot parse response`));
          }
        });
      });
    req.on('error', (err: any) => reject(err));
    req.write(body);
    req.end();
  });
}

// ─── Validação de proteção ─────────────────────────────────────────────────

function validateDeleteTarget(
  messageId: string,
  remoteJid: string,
  participant: string,
  senderJid: string,
  fromMe: boolean,
): { ok: boolean; error?: string; proceed: boolean } {
  const reasons: string[] = [];

  // 1. Grupo correto
  if (remoteJid !== GROUP_JID && participant !== GROUP_JID) {
    reasons.push(`grupo incorreto: remoteJid=${remoteJid} participant=${participant}`);
  }

  // 2. ID não vazio
  if (!messageId || messageId.length < 20) {
    reasons.push(`ID inválido/truncado: "${messageId}"`);
  }

  // 3. Não é do bot
  if (fromMe) {
    reasons.push(`mensagem do próprio bot (fromMe=true) — não excluir`);
  }

  // 4. Não é do WarriorBlack
  if (participant === '558581344211@s.whatsapp.net' ||
      participant === '558581344211@c.us' ||
      senderJid === '558581344211@s.whatsapp.net' ||
      senderJid === '558581344211@c.us') {
    reasons.push(`remetente é WarriorBlack — protegido`);
  }

  // 5. Não é do SolanoJr
  if (participant.includes('5588998314322') ||
      senderJid.includes('5588998314322')) {
    reasons.push(`remetente é SolanoJr (dono) — protegido`);
  }

  // 6. isProtectedTarget
  if (isProtectedTarget(participant) || isProtectedTarget(senderJid)) {
    reasons.push(`isProtectedTarget bloqueou`);
  }

  if (reasons.length > 0) {
    return { ok: false, error: reasons.join('; '), proceed: false };
  }

  return { ok: true, proceed: true };
}

// ─── Leitura do JSONL de capturas ──────────────────────────────────────────

function readCaptures(): CapturedEntry[] {
  if (!fs.existsSync(CAPTURE_FILE)) return [];
  try {
    const text = fs.readFileSync(CAPTURE_FILE, 'utf-8').trim();
    if (!text) return [];
    return text.split('\n')
      .filter(Boolean)
      .map((line: string) => {
        try { return JSON.parse(line) as CapturedEntry; } catch { return null as any; }
      })
      .filter((e: any): e is CapturedEntry => e != null)
      .filter((e: CapturedEntry) => e.groupId === GROUP_JID);
  } catch {
    return [];
  }
}

// ─── Busca mensagens via fetchMessageHistory ───────────────────────────────

async function fetchHistorySince(anchorTimestamp: number): Promise<any[]> {
  try {
    const resp = await httpPost(`${TEST_SERVER}/lab/history`, {
      platform: 'whatsapp',
      groupJid: GROUP_JID,
      oldestMsgId: '__ANCHOR__',
      oldestMsgTimestamp: anchorTimestamp,
      count: 200,
    });
    if (resp?.messages) {
      return resp.messages;
    }
    return [];
  } catch (err: any) {
    logger.warn(`[CASINO-EXCLUDE] fetchHistory falhou: ${err?.message}`);
    return [];
  }
}

// ─── Delete via testServer ─────────────────────────────────────────────────

async function deleteMessage(
  messageId: string,
  participant: string,
  fromMe: boolean,
): Promise<{ success: boolean; error?: string }> {
  try {
    const resp = await httpPost(`${TEST_SERVER}/lab/delete-message`, {
      platform: 'whatsapp',
      groupJid: GROUP_JID,
      messageId,
      participant,
      fromMe,
    });
    return { success: resp?.ok === true, error: resp?.error };
  } catch (err: any) {
    return { success: false, error: err?.message };
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  logger.info('[CASINO-EXCLUDE] ════════════════════════════════════════════════');
  logger.info('[CASINO-EXCLUDE] INICIANDO EXCLUSÃO DE MENSAGENS DE CASSINO');
  logger.info('[CASINO-EXCLUDE] Grupo: ' + GROUP_JID);
  logger.info('[CASINO-EXCLUDE] Remetente suspeito: ' + SUSPICIOUS_SENDER);
  logger.info('[CASINO-EXCLUDE] ════════════════════════════════════════════════');

  const results: DeleteResult[] = [];

  // ── Estratégia 1: capturas já existentes ──────────────────────────────
  const captures = readCaptures();
  logger.info(`[CASINO-EXCLUDE] Capturas no JSONL: ${captures.length}`);

  const suspiciousCaptures = captures.filter(
    (c) => c.senderJid === SUSPICIOUS_SENDER ||
           (c.contentType === 'buttonsMessage' && c.senderJid && c.senderJid !== '558581344211@c.us')
  );

  logger.info(`[CASINO-EXCLUDE] Capturas suspeitas do remetente-alvo: ${suspiciousCaptures.length}`);

  if (suspiciousCaptures.length > 0) {
    for (const cap of suspiciousCaptures) {
      const validation = validateDeleteTarget(
        cap.messageId,
        cap.remoteJid,
        cap.participant,
        cap.senderJid,
        cap.fromMe,
      );

      if (!validation.proceed) {
        logger.warn(`[CASINO-EXCLUDE] REJEITADO: ${cap.messageId} — ${validation.error}`);
        results.push({
          attempted: false,
          messageId: cap.messageId,
          senderJid: cap.senderJid,
          success: false,
          error: `REJEITADO: ${validation.error}`,
          timestamp: new Date().toISOString(),
        });
        continue;
      }

      logger.info(`[CASINO-EXCLUDE] Deletando captura: ${cap.messageId} de ${cap.senderJid}`);
      const deleteResult = await deleteMessage(cap.messageId, cap.participant, cap.fromMe);

      results.push({
        attempted: true,
        messageId: cap.messageId,
        senderJid: cap.senderJid,
        success: deleteResult.success,
        error: deleteResult.error,
        timestamp: new Date().toISOString(),
      });

      if (deleteResult.success) {
        logger.info(`[CASINO-EXCLUDE] ✅ DELETE SUCCESS: ${cap.messageId}`);
      } else {
        logger.error(`[CASINO-EXCLUDE] ❌ DELETE FAILED: ${cap.messageId} — ${deleteResult.error}`);
      }
    }
  }

  // ── Estratégia 2: fetchMessageHistory ────────────────────────────────
  if (results.filter(r => r.attempted).length === 0) {
    logger.info('[CASINO-EXCLUDE] Nenhuma captura disponível. Tentando fetchMessageHistory...');

    // Usar timestamp 7 dias atrás como âncora para buscar histórico recente
    const anchorTimestamp = Date.now() - (7 * 24 * 60 * 60 * 1000);
    const historyMessages = await fetchHistorySince(anchorTimestamp);

    if (historyMessages.length > 0) {
      logger.info(`[CASINO-EXCLUDE] fetchMessageHistory retornou ${historyMessages.length} mensagens`);

      // Filtrar por remetente suspeito
      const suspiciousHistory = historyMessages.filter(
        (msg: any) => {
          const key = msg.key || {};
          const sender = key.participant || key.remoteJid || '';
          return sender === SUSPICIOUS_SENDER ||
                 (key.remoteJid === GROUP_JID && key.participant === SUSPICIOUS_SENDER);
        }
      );

      logger.info(`[CASINO-EXCLUDE] Mensagens de ${SUSPICIOUS_SENDER} no histórico: ${suspiciousHistory.length}`);

      for (const msg of suspiciousHistory) {
        const key = msg.key || {};
        const messageId = key.id || '';
        const participant = key.participant || '';
        const fromMe = !!key.fromMe;

        const validation = validateDeleteTarget(messageId, GROUP_JID, participant, SUSPICIOUS_SENDER, fromMe);

        if (!validation.proceed) {
          logger.warn(`[CASINO-EXCLUDE] REJEITADO (história): ${messageId} — ${validation.error}`);
          results.push({
            attempted: false,
            messageId,
            senderJid: SUSPICIOUS_SENDER,
            success: false,
            error: `REJEITADO: ${validation.error}`,
            timestamp: new Date().toISOString(),
          });
          continue;
        }

        logger.info(`[CASINO-EXCLUDE] Deletando histórico: ${messageId}`);
        const deleteResult = await deleteMessage(messageId, participant, fromMe);

        results.push({
          attempted: true,
          messageId,
          senderJid: SUSPICIOUS_SENDER,
          success: deleteResult.success,
          error: deleteResult.error,
          timestamp: new Date().toISOString(),
        });

        if (deleteResult.success) {
          logger.info(`[CASINO-EXCLUDE] ✅ DELETE SUCCESS: ${messageId}`);
        } else {
          logger.error(`[CASINO-EXCLUDE] ❌ DELETE FAILED: ${messageId} — ${deleteResult.error}`);
        }
      }
    } else {
      logger.warn('[CASINO-EXCLUDE] fetchMessageHistory não retornou mensagens ou falhou.');
    }
  }

  // ── Resumo final ──────────────────────────────────────────────────────
  const attempted = results.filter(r => r.attempted);
  const succeeded = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  logger.info('[CASINO-EXCLUDE] ════════════════════════════════════════════════');
  logger.info(`[CASINO-EXCLUDE] RESUMO: ${attempted.length} tentativas, ${succeeded.length} sucesso, ${failed.length} falha`);
  logger.info('[CASINO-EXCLUDE] ════════════════════════════════════════════════');

  for (const r of results) {
    const status = r.success ? '✅' : '❌';
    logger.info(`${status} ${r.messageId} — ${r.senderJid} — ${r.success ? 'OK' : r.error}`);
  }

  // Salvar resultado
  fs.mkdirSync(path.dirname(RESULT_FILE), { recursive: true });
  fs.writeFileSync(RESULT_FILE, JSON.stringify({
    executedAt: new Date().toISOString(),
    groupJid: GROUP_JID,
    suspiciousSender: SUSPICIOUS_SENDER,
    summary: {
      attempted: attempted.length,
      succeeded: succeeded.length,
      failed: failed.length,
    },
    results,
  }, null, 2), 'utf-8');

  logger.info(`[CASINO-EXCLUDE] Resultado salvo: ${RESULT_FILE}`);

  if (succeeded.length > 0) {
    logger.info('[CASINO-EXCLUDE] ✅ MENSAGENS EXCLUÍDAS COM SUCESSO');
  } else if (attempted.length === 0) {
    logger.info('[CASINO-EXCLUDE] ⚠️ NENHUMA MENSAGEM ENCONTRADA PARA EXCLUIR');
  } else {
    logger.info('[CASINO-EXCLUDE] ❌ NENHUMA MENSAGEM FOI EXCLUÍDA COM SUCESSO');
  }

  logger.info('[CASINO-EXCLUDE] ════════════════════════════════════════════════');
}

main().catch((err: any) => {
  logger.error(`[CASINO-EXCLUDE] erro fatal: ${err?.message || err}`);
  process.exit(1);
});
