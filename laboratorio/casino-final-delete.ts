#!/usr/bin/env node
/**
 * laboratorio/casino-final-delete.ts
 *
 * Script final para exclusão controlada de mensagens.
 * Combina: fetchMessageHistory + captura persistente + modo monitoramento.
 *
 * Uso:
 *   node dist/laboratorio/casino-final-delete.js                    # usa configuração padrão (Figurinhas)
 *   node dist/laboratorio/casino-final-delete.js <GROUP_JID>        # grupo customizado
 *   node dist/laboratorio/casino-final-delete.js <GROUP_JID> <SENDER>  # remetente alvo
 */

import fs from 'fs';
import path from 'path';

// ─── Configuração ──────────────────────────────────────────────────────────

const DEFAULT_GROUP_JID = '5585981344211-1772111940@g.us';
const DEFAULT_SUSPICIOUS_SENDER = '1551234567890@c.us';
const CAPTURE_FILE = path.join(process.cwd(), 'laboratorio', 'captured-messages.jsonl');
const RESULT_FILE = path.join(process.cwd(), 'laboratorio', 'casino-final-delete-result.json');
const TEST_SERVER = 'http://127.0.0.1:3004';

// Args via CLI
const GROUP_JID = process.argv[2] || DEFAULT_GROUP_JID;
const SUSPICIOUS_SENDER = process.argv[3] || DEFAULT_SUSPICIOUS_SENDER;

// ─── Logger simples ────────────────────────────────────────────────────────

function log(level: string, msg: string): void {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [FINAL-DELETE][${level}] ${msg}`);
}
const loggerInfo = (msg: string) => log('INFO', msg);
const loggerWarn = (msg: string) => log('WARN', msg);
const loggerError = (msg: string) => log('ERROR', msg);

// ─── Validação de segurança (inline — independente do projeto) ────────────

function isProtectedTarget(jid: string): boolean {
  if (!jid || typeof jid !== 'string') return false;
  const cleaned = jid.replace(/@.*$/, '').replace(/^\+/, '').replace(/:\d+$/, '');
  const protectedNumbers = ['558581344211', '5588998314322'];
  return protectedNumbers.some(n => cleaned.includes(n));
}

function validateDeleteTarget(
  messageId: string,
  remoteJid: string,
  participant: string,
  senderJid: string,
  fromMe: boolean,
): { ok: boolean; error?: string; proceed: boolean } {
  const reasons: string[] = [];
  const protectedNumbers = ['558581344211', '5588998314322'];

  // 1. Grupo correto
  if (remoteJid !== GROUP_JID && participant !== GROUP_JID) {
    reasons.push(`grupo incorreto (esperado: ${GROUP_JID})`);
  }

  // 2. ID válido (não truncado)
  if (!messageId || messageId.length < 20) {
    reasons.push(`ID inválido/truncado: "${messageId}"`);
  }

  // 3. Não é do próprio bot
  if (fromMe) {
    reasons.push(`fromMe=true — mensagem do próprio bot, não excluir`);
  }

  // 4. Não é WarriorBlack nem dono
  const cleanParticipant = participant?.replace(/[@:].*/, '') || '';
  const cleanSenderJid = senderJid?.replace(/[@:].*/, '') || '';
  for (const n of protectedNumbers) {
    if (cleanParticipant === n) reasons.push(`participant é WarriorBlack/dono (${n})`);
    if (cleanSenderJid === n) reasons.push(`senderJid é WarriorBlack/dono (${n})`);
  }

  // 5. isProtectedTarget
  if (isProtectedTarget(participant) || isProtectedTarget(senderJid)) {
    reasons.push(`isProtectedTarget bloqueou`);
  }

  if (reasons.length > 0) {
    return { ok: false, error: reasons.join('; '), proceed: false };
  }
  return { ok: true, proceed: true };
}

// ─── HTTP helper ───────────────────────────────────────────────────────────

function httpPost(url: string, data: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const body = JSON.stringify(data);
    const mod = parsed.protocol === 'https:' ? require('https') : require('http');
    const req = mod.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res: any) => {
      let body2 = '';
      res.on('data', (c: any) => body2 += c);
      res.on('end', () => {
        try {
          const p = JSON.parse(body2);
          if (res.statusCode !== 200) reject(new Error(p.error || 'HTTP error'));
          else resolve(p);
        } catch {
          reject(new Error(`Cannot parse response (status ${res.statusCode}): ${body2.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ─── Leitura do JSONL ──────────────────────────────────────────────────────

function readCaptures(): Array<Record<string, any>> {
  if (!fs.existsSync(CAPTURE_FILE)) return [];
  try {
    const text = fs.readFileSync(CAPTURE_FILE, 'utf-8').trim();
    if (!text) return [];
    return text.split('\n')
      .filter(Boolean)
      .map((line: string) => {
        try { return JSON.parse(line); } catch { return null; }
      })
      .filter((e: any): e is Record<string, any> => e != null)
      .filter((e: Record<string, any>) =>
        e.groupId === GROUP_JID ||
        e.remoteJid === GROUP_JID ||
        e.participant === GROUP_JID
      );
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

// ─── Estratégia B: fetchHistory + captura ─────────────────────────────────

async function executarEstrategiaB(): Promise<Array<any>> {
  const resultados: Array<any> = [];

  loggerInfo('═══ Estratégia B: fetchMessageHistory + captura ═══');
  loggerInfo(`Grupo: ${GROUP_JID}`);
  loggerInfo(`Remetente suspeito: ${SUSPICIOUS_SENDER}`);

  const antes = readCaptures().length;
  loggerInfo(`Capturas antes do fetch: ${antes}`);

  // 1. Solicitamos o histórico
  loggerInfo('Solicitando fetchMessageHistory via PDO...');
  try {
    await httpPost(`${TEST_SERVER}/lab/history`, {
      platform: 'whatsapp',
      groupJid: GROUP_JID,
      oldestMsgId: '__MOST_RECENT__',
      oldestMsgTimestamp: 0,
      count: 200,
    });
    loggerInfo('Histórico solicitado com sucesso.');
  } catch (err: any) {
    loggerError(`Erro ao solicitar histórico: ${err?.message}`);
  }

  // 2. Aguardamos processamento
  loggerInfo('Aguardando 15s para o Baileys processar a resposta...');
  await new Promise((r) => setTimeout(r, 15000));

  // 3. Verificamos capturas
  const capturas = readCaptures();
  const novas = capturas.length - antes;
  loggerInfo(`Capturas após fetch: ${capturas.length} (novas: ${novas})`);

  if (capturas.length === 0) {
    loggerWarn('NENHUMA captura no JSONL.');
    return resultados;
  }

  // 4. Filtramos mensagens suspeitas
  const suspeitas = capturas.filter((c) =>
    c.senderJid === SUSPICIOUS_SENDER ||
    c.contentType === 'buttonsMessage' ||
    c.contentType === 'interactiveMessage' ||
    c.contentType === 'templateMessage' ||
    c.contentType === 'productMessage' ||
    (c.senderJid && !c.senderJid.includes('558581344211') && !c.senderJid.includes('5588998314322') && c.contentType !== 'conversation')
  );

  loggerInfo(`Mensagens suspeitas encontradas no histórico: ${suspeitas.length}`);

  for (const cap of suspeitas) {
    const validacao = validateDeleteTarget(
      cap.messageId,
      cap.remoteJid,
      cap.participant,
      cap.senderJid,
      cap.fromMe,
    );

    if (!validacao.proceed) {
      loggerWarn(`REJEITADO: ${cap.messageId} — ${validacao.error}`);
      resultados.push({
        messageId: cap.messageId,
        senderJid: cap.senderJid,
        rejected: true,
        reason: validacao.error,
      });
      continue;
    }

    loggerInfo(`Deletando: ${cap.messageId} de ${cap.senderJid} (${cap.contentType})`);
    const del = await deleteMessage(cap.messageId, cap.participant, cap.fromMe);

    resultados.push({
      messageId: cap.messageId,
      senderJid: cap.senderJid,
      contentType: cap.contentType,
      timestamp: cap.timestamp,
      success: del.success,
      error: del.error,
    });

    if (del.success) {
      loggerInfo(`✅ DELETE SUCCESS: ${cap.messageId}`);
    } else {
      loggerError(`❌ DELETE FAILED: ${cap.messageId} — ${del.error}`);
    }
  }

  return resultados;
}

// ─── Estratégia A: Monitoramento até encontrar ─────────────────────────────

async function executarEstrategiaA(): Promise<Array<any>> {
  const resultados: Array<any> = [];
  const start = Date.now();
  const MONITOR_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutos

  loggerInfo('═══ Estratégia A: Monitoramento até encontrar mensagem ═══');
  loggerInfo(`Timeout: ${MONITOR_TIMEOUT_MS / 60000} minutos`);

  let contagemAntes = readCaptures().length;
  loggerInfo(`Capturas antes do monitoramento: ${contagemAntes}`);

  while (Date.now() - start < MONITOR_TIMEOUT_MS) {
    const capturas = readCaptures();
    const novas = capturas.slice(contagemAntes);

    if (novas.length > 0) {
      loggerInfo(`Mensagem(s) nova(s) capturada(s): ${novas.length}`);
      for (const cap of novas) {
        loggerInfo(`Nova captura: ${cap.messageId} de ${cap.senderJid} (${cap.contentType})`);

        const validacao = validateDeleteTarget(
          cap.messageId,
          cap.remoteJid,
          cap.participant,
          cap.senderJid,
          cap.fromMe,
        );

        if (!validacao.proceed) {
          loggerWarn(`REJEITADO: ${cap.messageId} — ${validacao.error}`);
          resultados.push({
            messageId: cap.messageId,
            senderJid: cap.senderJid,
            rejected: true,
            reason: validacao.error,
          });
          continue;
        }

        loggerInfo(`Deletando em tempo real: ${cap.messageId}`);
        const del = await deleteMessage(cap.messageId, cap.participant, cap.fromMe);

        resultados.push({
          messageId: cap.messageId,
          senderJid: cap.senderJid,
          contentType: cap.contentType,
          timestamp: cap.timestamp,
          success: del.success,
          error: del.error,
        });

        if (del.success) {
          loggerInfo(`✅ DELETE SUCCESS: ${cap.messageId}`);
        } else {
          loggerError(`❌ DELETE FAILED: ${cap.messageId} — ${del.error}`);
        }

        if (del.success && cap.senderJid === SUSPICIOUS_SENDER) {
          loggerInfo('Mensagem do cassino deletada. Encerrando.');
          return resultados;
        }
      }

      contagemAntes = capturas.length;
    }

    await new Promise((r) => setTimeout(r, 10000));
  }

  loggerWarn(`Timeout de ${MONITOR_TIMEOUT_MS / 60000}min atingido.`);
  return resultados;
}

// ─── Fluxo principal ───────────────────────────────────────────────────────

async function main(): Promise<void> {
  loggerInfo('═══════════════════════════════════════════════════════════════');
  loggerInfo('INICIANDO EXCLUSÃO CONTROLADA DE MENSAGENS');
  loggerInfo(`Grupo: ${GROUP_JID}`);
  loggerInfo(`Remetente suspeito: ${SUSPICIOUS_SENDER}`);
  loggerInfo(`Arquivo de capturas: ${CAPTURE_FILE}`);
  loggerInfo('═══════════════════════════════════════════════════════════════');

  const todosResultados: Array<any> = [];

  // ── Estratégia B: tentativa imediata ────────────────────────────────────
  const resultadosB = await executarEstrategiaB();
  todosResultados.push(...resultadosB);

  // ── Estratégia A: monitoramento ──────────────────────────────────────────
  const deletadosB = resultadosB.filter((r: any) => r.success).length;
  if (deletadosB === 0) {
    loggerInfo('Nenhuma mensagem deletada pela Estratégia B.');
    loggerInfo('Iniciando monitoramento (Estratégia A)...');
    const resultadosA = await executarEstrategiaA();
    todosResultados.push(...resultadosA);
  } else {
    loggerInfo(`${deletadosB} mensagem(ens) deletada(s) pela Estratégia B.`);
  }

  // ── Relatório final ──────────────────────────────────────────────────────
  const tentativas = todosResultados.filter((r: any) => !r.rejected);
  const rejeitados = todosResultados.filter((r: any) => r.rejected);
  const sucesso = todosResultados.filter((r: any) => r.success);
  const falhas = todosResultados.filter((r: any) => !r.success && !r.rejected);

  loggerInfo('═══════════════════════════════════════════════════════════════');
  loggerInfo('RELATÓRIO FINAL');
  loggerInfo('───────────────────────────────────────────────────────────────');
  loggerInfo(`Total de capturas no JSONL: ${readCaptures().length}`);
  loggerInfo(`Tentativas: ${tentativas.length}`);
  loggerInfo(`Rejeitados: ${rejeitados.length}`);
  loggerInfo(`Sucesso: ${sucesso.length}`);
  loggerInfo(`Falhas: ${falhas.length}`);
  loggerInfo('───────────────────────────────────────────────────────────────');

  for (const r of todosResultados) {
    if (r.rejected) {
      loggerWarn(`⛔ REJEITADO: ${r.messageId} — ${r.reason}`);
    } else if (r.success) {
      loggerInfo(`✅ ${r.messageId} (${r.contentType || 'N/A'}) — DELETADO — remetente: ${r.senderJid}`);
    } else {
      loggerError(`❌ ${r.messageId} (${r.contentType || 'N/A'}) — FALHA — remetente: ${r.senderJid} — erro: ${r.error}`);
    }
  }

  loggerInfo('═══════════════════════════════════════════════════════════════');

  // Salvar resultado
  fs.mkdirSync(path.dirname(RESULT_FILE), { recursive: true });
  fs.writeFileSync(RESULT_FILE, JSON.stringify({
    executedAt: new Date().toISOString(),
    strategy: 'B (fetchHistory) + A (monitoramento)',
    groupJid: GROUP_JID,
    suspiciousSender: SUSPICIOUS_SENDER,
    captureFile: CAPTURE_FILE,
    summary: {
      totalCapturas: readCaptures().length,
      tentativas: tentativas.length,
      rejeitados: rejeitados.length,
      sucesso: sucesso.length,
      falhas: falhas.length,
    },
    results: todosResultados,
  }, null, 2), 'utf-8');

  loggerInfo(`Resultado salvo em: ${RESULT_FILE}`);

  if (sucesso.length > 0) {
    loggerInfo('✅ MENSAGENS EXCLUÍDAS COM SUCESSO');
  } else if (tentativas.length === 0) {
    loggerInfo('⚠️ NENHUMA MENSAGEM SUSPEITA ENCONTRADA');
  } else {
    loggerInfo('❌ NENHUMA MENSAGEM FOI EXCLUÍDA COM SUCESSO');
  }
  loggerInfo('═══════════════════════════════════════════════════════════════');
}

main().catch((err: any) => {
  console.error(`[FINAL-DELETE] erro fatal: ${err?.message || err}`);
  process.exit(1);
});
