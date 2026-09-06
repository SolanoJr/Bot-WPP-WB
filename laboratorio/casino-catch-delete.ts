#!/usr/bin/env node
/**
 * laboratorio/casino-catch-delete.ts
 *
 * Opção B: Tenta recuperar mensagens do histórico via fetchMessageHistory
 * e capturar o WAMessageKey completo via messages.upsert, para depois deletar.
 *
 * Fluxo:
 * 1. Chama /lab/history para solicitar histórico do grupo
 * 2. Aguarda N segundos para o Baileys processar e emitir messages.upsert
 * 3. Lê captured-messages.jsonl para ver se as mensagens foram capturadas
 * 4. Se sim, executa delete de cada mensagem suspeita
 *
 * Se não encontrar, cai em monitoramento (Opção A).
 */

import { isProtectedTarget } from '../src/services/permissions';
import logger from '../src/services/loggerService';
import fs from 'node:fs';
import path from 'node:path';

// ─── Configuração ──────────────────────────────────────────────────────────

const GROUP_JID = '5585981344211-1772111940@g.us';
const SUSPICIOUS_SENDER = '1551234567890@c.us';
const CAPTURE_FILE = path.join(process.cwd(), 'laboratorio', 'captured-messages.jsonl');
const RESULT_FILE = path.join(process.cwd(), 'laboratorio', 'casino-catch-delete-result.json');
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
            reject(new Error(`HTTP ${res.statusCode}: cannot parse response (body: ${responseBody.slice(0, 200)})`));
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

  if (remoteJid !== GROUP_JID && participant !== GROUP_JID) {
    reasons.push(`grupo incorreto: ${remoteJid}`);
  }
  if (!messageId || messageId.length < 20) {
    reasons.push(`ID inválido/truncado: "${messageId}"`);
  }
  if (fromMe) {
    reasons.push(`mensagem do próprio bot (fromMe=true) — não excluir`);
  }
  if (participant === '558581344211@s.whatsapp.net' ||
      participant === '558581344211@c.us' ||
      senderJid === '558581344211@s.whatsapp.net' ||
      senderJid === '558581344211@c.us') {
    reasons.push(`remetente é WarriorBlack — protegido`);
  }
  if (participant.includes('5588998314322') ||
      senderJid.includes('5588998314322')) {
    reasons.push(`remetente é SolanoJr (dono) — protegido`);
  }
  if (isProtectedTarget(participant) || isProtectedTarget(senderJid)) {
    reasons.push(`isProtectedTarget bloqueou`);
  }

  if (reasons.length > 0) {
    return { ok: false, error: reasons.join('; '), proceed: false };
  }
  return { ok: true, proceed: true };
}

// ─── Leitura do JSONL ──────────────────────────────────────────────────────

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
  } catch { return []; }
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

// ─── Fluxo principal ───────────────────────────────────────────────────────

async function main(): Promise<void> {
  logger.info('[CATCH-DELETE] ════════════════════════════════════════════════');
  logger.info('[CATCH-DELETE] OPÇÃO B: fetchMessageHistory + captura + delete');
  logger.info('[CATCH-DELETE] grupo: ' + GROUP_JID);
  logger.info('[CATCH-DELETE] ════════════════════════════════════════════════');

  const results: any[] = [];

  // ── Passo 1: Sincronizar histórico ──────────────────────────────────────
  logger.info('[CATCH-DELETE] Solicitando fetchMessageHistory...');

  const beforeCount = readCaptures().length;

  try {
    await httpPost(`${TEST_SERVER}/lab/history`, {
      platform: 'whatsapp',
      groupJid: GROUP_JID,
      oldestMsgId: '__MOST_RECENT__',
      oldestMsgTimestamp: 0,
      count: 100,
    });
    logger.info('[CATCH-DELETE] Histórico solicitado. Aguardando processamento...');
  } catch (err: any) {
    logger.error(`[CATCH-DELETE] Erro ao solicitar histórico: ${err?.message}`);
  }

  // ── Passo 2: Aguardar captura ────────────────────────────────────────────
  const WAIT_SECONDS = 10;
  logger.info(`[CATCH-DELETE] Aguardando ${WAIT_SECONDS}s para o Baileys processar...`);
  await new Promise((r) => setTimeout(r, WAIT_SECONDS * 1000));

  // ── Passo 3: Verificar capturas ──────────────────────────────────────────
  const captures = readCaptures();
  const newCaptures = captures.length - beforeCount;

  logger.info(`[CATCH-DELETE] Capturas totais: ${captures.length} (novas: ${newCaptures})`);

  if (captures.length === 0) {
    logger.warn('[CATCH-DELETE] NENHUMA captura no JSONL após fetchHistory.');
    logger.info('[CATCH-DELETE] O servidor pode não ter enviado mensagens recentes via PDO.');
    logger.info('[CATCH-DELETE] Alternativa: monitorar até próxima mensagem do cassino.');
  }

  // ── Filtrar mensagens suspeitas ───────────────────────────────────────────
  const suspicious = captures.filter(
    (c) => c.senderJid === SUSPICIOUS_SENDER ||
           c.contentType === 'buttonsMessage' ||
           c.contentType === 'interactiveMessage' ||
           c.contentType === 'templateMessage'
  );

  logger.info(`[CATCH-DELETE] Mensagens suspeitas encontradas: ${suspicious.length}`);

  for (const cap of suspicious) {
    const validation = validateDeleteTarget(
      cap.messageId,
      cap.remoteJid,
      cap.participant,
      cap.senderJid,
      cap.fromMe,
    );

    if (!validation.proceed) {
      logger.warn(`[CATCH-DELETE] REJEITADO: ${cap.messageId} — ${validation.error}`);
      results.push({
        messageId: cap.messageId,
        senderJid: cap.senderJid,
        rejected: true,
        reason: validation.error,
      });
      continue;
    }

    logger.info(`[CATCH-DELETE] Deletando: ${cap.messageId} de ${cap.senderJid} (${cap.contentType})`);
    const delResult = await deleteMessage(cap.messageId, cap.participant, cap.fromMe);

    results.push({
      messageId: cap.messageId,
      senderJid: cap.senderJid,
      contentType: cap.contentType,
      timestamp: cap.timestamp,
      success: delResult.success,
      error: delResult.error,
    });

    if (delResult.success) {
      logger.info(`[CATCH-DELETE] ✅ DELETE SUCCESS: ${cap.messageId}`);
    } else {
      logger.error(`[CATCH-DELETE] ❌ DELETE FAILED: ${cap.messageId} — ${delResult.error}`);
    }
  }

  // ── Resultado ─────────────────────────────────────────────────────────────
  const attempted = results.filter((r: any) => !r.rejected);
  const succeeded = results.filter((r: any) => r.success);
  const failed = results.filter((r: any) => !r.success && !r.rejected);

  logger.info('[CATCH-DELETE] ════════════════════════════════════════════════');
  logger.info(`[CATCH-DELETE] RESULTADO: ${attempted.length} tentativas, ${succeeded.length} OK, ${failed.length} falha`);
  logger.info('[CATCH-DELETE] ════════════════════════════════════════════════');

  for (const r of results) {
    if (r.rejected) {
      logger.warn(`⛔ REJEITADO: ${r.messageId} — ${r.reason}`);
    } else if (r.success) {
      logger.info(`✅ ${r.messageId} (${r.contentType}) — DELETADO`);
    } else {
      logger.error(`❌ ${r.messageId} (${r.contentType}) — ${r.error}`);
    }
  }

  // Salvar
  fs.mkdirSync(path.dirname(RESULT_FILE), { recursive: true });
  fs.writeFileSync(RESULT_FILE, JSON.stringify({
    executedAt: new Date().toISOString(),
    strategy: 'fetchhistory+capture',
    groupJid: GROUP_JID,
    summary: {
      totalCaptures: captures.length,
      newCaptures,
      suspiciousFound: suspicious.length,
      attempted: attempted.length,
      succeeded: succeeded.length,
      failed: failed.length,
      rejected: results.filter((r: any) => r.rejected).length,
    },
    results,
  }, null, 2), 'utf-8');

  if (succeeded.length > 0) {
    logger.info('[CATCH-DELETE] ✅ MENSAGENS DE CASSINO EXCLUÍDAS COM SUCESSO');
  } else if (attempted.length === 0) {
    logger.info('[CATCH-DELETE] ⚠️ NENHUMA MENSAGEM SUSPEITA ENCONTRADA NO HISTÓRICO');
    logger.info('[CATCH-DELETE] Opção A (monitorar): a captura está ativa. Aguarde a próxima mensagem do cassino.');
  } else {
    logger.info('[CATCH-DELETE] ❌ FALHA NA EXCLUSÃO — ver erros acima');
  }
  logger.info('[CATCH-DELETE] ════════════════════════════════════════════════');
}

main().catch((err: any) => {
  logger.error(`[CATCH-DELETE] erro fatal: ${err?.message || err}`);
  process.exit(1);
});
