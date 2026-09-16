#!/usr/bin/env node
/**
 * laboratorio/apagar-spam.ts
 *
 * Script para exclusão silenciosa de mensagens de spam de cassino/betano
 * já capturadas no JSONL de capturas.
 *
 * Identifica mensagens com:
 *   - Remetente estrangeiro (número não começa com 55)
 *   - Domínios suspeitos (games, bet, win, casino, bonus, etc.)
 *   - Palavras-chave de spam (bônus, recolha, vitórias, CK7, kl7, etc.)
 *   - Mensagens interativas (botões, cards, templates)
 *   - Combinação de sinais (foreign + domínio suspeito + keyword)
 *
 * Executa exclusão silenciosa via testServer /lab/delete-message.
 * Registra resultado completo em laboratorio/apagar-spam-result.json.
 *
 * Uso:
 *   node dist/laboratorio/apagar-spam.js                    # moda segura (apenas se >=2 sinais)
 *   node dist/laboratorio/apagar-spam.js --force           # força exclusão de qualquer spam detectado
 *   node dist/laboratorio/apagar-spam.js --dry-run         # mostra o que deletaria sem executar
 *   node dist/laboratorio/apagar-spam.js --group JID       # foca em um grupo específico
 *   node dist/laboratorio/apagar-spam.js --sender JID      # foca em um remetente específico
 *   node dist/laboratorio/apagar-spam.js --after TIMESTAMP # apenas mensagens após este timestamp (ms)
 *   node dist/laboratorio/apagar-spam.js --before TIMESTAMP # apenas mensagens antes deste timestamp (ms)
 *   node dist/laboratorio/apagar-spam.js --limit N         # limita a N exclusões
 *
 * Regras de proteção:
 *   - NUNCA apaga do WarriorBlack (558581344211)
 *   - NUNCA apaga do SolanoJr (5588998314322)
 *   - NUNCA apaga mensagens do próprio bot (fromMe=true)
 *   - NUNCA apaga se isProtectedTarget retornar true
 *   - NUNCA apaga se o grupo não for @g.us (evita apagar em privados)
 */

import fs from 'fs';
import path from 'path';
import { argv, cwd } from 'process';
import http from 'http';

const TEST_SERVER = 'http://127.0.0.1:3004';
const RESULT_FILE = path.join(cwd(), 'laboratorio', 'apagar-spam-result.json');
const CAPTURE_FILE = path.join(cwd(), 'laboratorio', 'captured-messages.jsonl');
const CAPTURE_DIR = path.join(cwd(), 'laboratorio');

// ─── Configurações ────────────────────────────────────────────────────────────
const TARGET_PHONE = '6282364007211'; // spammer indonésio da imagem
const GROUP_KEYWORD = 'Figurinhas';

// Domínios suspeitos (extensão da lista do autoModEngine)
const SUSPICIOUS_DOMAINS = [
  'wtf', 'bet', 'game', 'games', 'win', 'xyz', 'top', 'click',
  'casino', 'bonus', 'bônus', 'bónus', 'aposta', 'apostas', 'vareja',
  'sport', 'jackpot', 'slots', 'poker', 'bing', 'lucky', 'vip',
  'gratuito', 'fun', 'pk', 'sh', 'play', 'fortune', 'tiger',
  'rabbit', 'ox', 'mouse', 'pgsoft', '777', 'kl7', 'ck7', 'ck7bet',
  'score', 'result', 'draw', 'match', 'live', 'stream', 'tv',
];

// Palavras-chave de spam (extensão da lista do autoModEngine)
const SPAM_KEYWORDS = [
  'ganhe dinheiro', 'lucro fácil', 'recolha', 'recolha contínua',
  'bónus', 'bônus', 'taxa de vitórias', 'jogue e ganhe',
  'dinheiro fácil', 'recolhidos à vontade', 'coloque agora',
  'ptsu mae', 'ganhar', 'sorte', 'acumulado', 'presentes 777',
  '777-7777', 'ck7', 'ck7bet', 'plataforma nova', 'rodadas grátis',
  'giros grátis', 'pagando muito', 'deposite', 'saque rápido',
  'link de cadastro', 'kl7.games', 'ck7bet', '7777', 'recolha',
  'bônus', 'bónus', 'jogos', 'apostas', 'todos os dias',
  'conheça', 'experimente', 'jogue', 'ganhe', 'prêmio', 'sortio',
  'jackpot', 'slot', 'roleta', 'notícias', 'já', '50%', '100%',
];

// Números protegidos (nunca apagar)
const PROTECTED_NUMBERS = [
  '558581344211', // WarriorBlack
  '5588998314322', // SolanoJr
];

// ─── Argumentos ──────────────────────────────────────────────────────────────
const args = argv.slice(2);
function getArg(name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  return undefined;
}

const forceMode = args.includes('--force');
const dryRun = args.includes('--dry-run');
const specificGroup = getArg('--group');
const specificSender = getArg('--sender');
const afterTimestamp = getArg('--after') ? Number(getArg('--after')!) : undefined;
const beforeTimestamp = getArg('--before') ? Number(getArg('--before')!) : undefined;
const limitStr = getArg('--limit');
const limit = limitStr ? Number(limitStr) : undefined;

// ─── Utilidades ──────────────────────────────────────────────────────────────
function log(msg: string) {
  console.log(`[APAGAR-SPAM] ${msg}`);
}

function logError(msg: string) {
  console.error(`[APAGAR-SPAM-ERR] ${msg}`);
}

function logWarn(msg: string) {
  console.warn(`[APAGAR-SPAM-WARN] ${msg}`);
}

function httpPost(url: string, data: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const body = JSON.stringify(data);
    const req = http.request({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      let resBody = '';
      res.on('data', chunk => resBody += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(resBody));
        } catch {
          resolve({ _raw: resBody, statusCode: res.statusCode });
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ─── Detecção de spam ────────────────────────────────────────────────────────
interface SpamSignals {
  foreign: boolean;
  suspiciousDomain: boolean;
  spamKeyword: boolean;
  interactive: boolean;
  buttons: boolean;
  template: boolean;
  product: boolean;
  lowText: boolean;
  highScore: boolean;
  signals: string[];
  score: number;
}

function detectSpamSignals(entry: any): SpamSignals {
  const signals: string[] = [];
  let score = 0;

  const senderJid = entry.senderJid || entry.participant || '';
  const groupId = entry.groupId || entry.remoteJid || '';
  const textPreview = entry.textPreview || '';
  const contentType = entry.contentType || '';
  const fromMe = entry.fromMe || false;

  // Extrair número do senderJid
  const senderNumber = senderJid.replace(/\D/g, '');
  const isForeign = senderNumber.length > 0 && !senderNumber.startsWith('55');

  // 1. Remetente estrangeiro
  if (isForeign) {
    signals.push('foreign');
    score += 2;
  }

  // 2. Domínio suspeito no texto
  const lowerText = textPreview.toLowerCase();
  let hasSuspiciousDomain = false;
  for (const domain of SUSPICIOUS_DOMAINS) {
    if (lowerText.includes(domain)) {
      hasSuspiciousDomain = true;
      break;
    }
  }
  // Checar URLs diretamente
  const urlRegex = /https?:\/\/[^\s<>"']+|www\.[^\s<>"']+/gi;
  let match: RegExpExecArray | null;
  while ((match = urlRegex.exec(textPreview)) !== null) {
    const url = match[0];
    try {
      const p = new URL(url.startsWith('www.') ? 'http://' + url : url);
      const hostname = p.hostname.toLowerCase();
      for (const domain of SUSPICIOUS_DOMAINS) {
        if (hostname.includes(domain)) {
          hasSuspiciousDomain = true;
          break;
        }
      }
    } catch { /* invalid URL */ }
  }
  if (hasSuspiciousDomain) {
    signals.push('suspicious_domain');
    score += 2;
  }

  // 3. Palavra-chave de spam
  let hasSpamKeyword = false;
  for (const kw of SPAM_KEYWORDS) {
    if (lowerText.includes(kw)) {
      hasSpamKeyword = true;
      signals.push(`spam_keyword:${kw}`);
      score += 1;
      break;
    }
  }

  // 4. Mensagem interativa (botões, cards, templates)
  const isInteractive = contentType === 'buttonsMessage' ||
                       contentType === 'interactiveMessage' ||
                       contentType === 'templateMessage' ||
                       contentType === 'productMessage';
  if (isInteractive) {
    signals.push('interactive');
    score += 2;
  }

  // 5. Baixa quantidade de texto (spammers frequentemente usam cards com pouco texto)
  const textLength = textPreview.length;
  if (textLength < 50 && contentType !== 'conversation') {
    signals.push('low_text');
    score += 1;
  }

  // 6. Combinação específica: foreign + domínio + keyword
  if (isForeign && hasSuspiciousDomain && hasSpamKeyword) {
    signals.push('high_score_combination');
    score += 5; // Score muito alto para combinação perfeita
  }

  // 7. Mensagem de grupo com foreign + qualquer conteúdo suspeito
  const isGroup = groupId.endsWith('@g.us');
  if (isGroup && isForeign && (hasSuspiciousDomain || hasSpamKeyword)) {
    signals.push('group_foreign_suspicious');
    score += 3;
  }

  return {
    foreign: isForeign,
    suspiciousDomain: hasSuspiciousDomain,
    spamKeyword: hasSpamKeyword,
    interactive: isInteractive,
    buttons: contentType === 'buttonsMessage',
    template: contentType === 'templateMessage',
    product: contentType === 'productMessage',
    lowText: textLength < 50 && contentType !== 'conversation',
    highScore: score >= 4,
    signals,
    score,
  };
}

// ─── Validação de proteção ──────────────────────────────────────────────────
function isProtectedNumber(jid: string): boolean {
  if (!jid) return false;
  const cleaned = jid.replace(/\D/g, '');
  return PROTECTED_NUMBERS.some(n => cleaned.includes(n));
}

function validateDeleteTarget(entry: any): { ok: boolean; error?: string; proceed: boolean } {
  const reasons: string[] = [];

  // 1. Não é do bot
  if (entry.fromMe) {
    reasons.push('mensagem do próprio bot (fromMe=true)');
  }

  // 2. Não é WarriorBlack ou SolanoJr
  const senderJid = entry.senderJid || entry.participant || '';
  const participant = entry.participant || '';
  if (isProtectedNumber(senderJid)) {
    reasons.push(`senderJid protegido: ${senderJid}`);
  }
  if (isProtectedNumber(participant)) {
    reasons.push(`participant protegido: ${participant}`);
  }

  // 3. É um grupo (apenas @g.us)
  const groupId = entry.groupId || entry.remoteJid || '';
  if (!groupId.endsWith('@g.us')) {
    reasons.push(`não é um grupo (@g.us): ${groupId}`);
  }

  // 4. ID válido
  const messageId = entry.messageId || '';
  if (!messageId || messageId.length < 20) {
    reasons.push(`ID inválido/truncado: "${messageId}"`);
  }

  if (reasons.length > 0) {
    return { ok: false, error: reasons.join('; '), proceed: false };
  }

  return { ok: true, proceed: true };
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
        try { return JSON.parse(line); } catch { return null as any; }
      })
      .filter((e: any): e is Record<string, any> => e != null);
  } catch {
    return [];
  }
}

// ─── Delete via testServer ──────────────────────────────────────────────────
async function deleteMessage(
  messageId: string,
  participant: string,
  fromMe: boolean,
  groupJid: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const resp = await httpPost(`${TEST_SERVER}/lab/delete-message`, {
      platform: 'whatsapp',
      groupJid,
      messageId,
      participant,
      fromMe,
    });
    return {
      success: resp?.ok === true,
      error: resp?.error || (resp?._raw ? `HTTP erro: ${resp._raw.slice(0, 200)}` : undefined),
    };
  } catch (err: any) {
    return { success: false, error: err?.message };
  }
}

// ─── Filtragem de mensagens alvo ────────────────────────────────────────────
function filterTargetMessages(
  captures: Array<Record<string, any>>,
): Array<{ entry: Record<string, any>; signals: SpamSignals; validation: { ok: boolean; error?: string; proceed: boolean } }> {
  const results: Array<{ entry: Record<string, any>; signals: SpamSignals; validation: { ok: boolean; error?: string; proceed: boolean } }> = [];

  for (const entry of captures) {
    // Filtro de grupo
    if (specificGroup && entry.groupId !== specificGroup && entry.remoteJid !== specificGroup) {
      continue;
    }

    // Filtro de remetente
    if (specificSender) {
      const senderJid = entry.senderJid || entry.participant || '';
      const participant = entry.participant || '';
      if (senderJid !== specificSender && participant !== specificSender) {
        continue;
      }
    }

    // Filtro temporal
    const ts = entry.timestamp || 0;
    if (afterTimestamp && ts < afterTimestamp) continue;
    if (beforeTimestamp && ts > beforeTimestamp) continue;

    // Detecção de sinais
    const signals = detectSpamSignals(entry);

    // Critério de seleção: em modo force, qualquer sinal positivo; senão, >=2 sinais ou score >=4
    const shouldSelect =
      forceMode
        ? signals.signals.length > 0
        : signals.signals.length >= 2 || signals.score >= 4;

    if (!shouldSelect) continue;

    // Validação de segurança
    const validation = validateDeleteTarget(entry);
    if (!validation.proceed) {
      logWarn(`REJEITADO (validação): ${entry.messageId} — ${validation.error}`);
      results.push({ entry, signals, validation });
      continue;
    }

    results.push({ entry, signals, validation });
  }

  return results;
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  log('===============================================================');
  log('EXCLUSÃO SILENCIOSA DE SPAM DE CASSINO/BETAN');
  log('===============================================================');

  log(` Modo:          ${dryRun ? 'DRY-RUN (não executa deletes)' : forceMode ? 'FORCE (qualquer sinal)' : 'SAFE (>=2 sinais ou score>=4)'}`);
  log(` Grupo filter:  ${specificGroup || 'todos'}`);
  log(` Sender filter: ${specificSender || 'todos'}`);
  log(` After:         ${afterTimestamp ? new Date(afterTimestamp).toISOString() : 'não filtrado'}`);
  log(` Before:        ${beforeTimestamp ? new Date(beforeTimestamp).toISOString() : 'não filtrado'}`);
  log(` Limit:         ${limit || 'ilimitado'}`);
  log(` Arquivo:       ${CAPTURE_FILE}`);
  log('===============================================================');

  // Lê capturas
  const allCaptures = readCaptures();
  log(`Total de capturas no JSONL: ${allCaptures.length}`);

  if (allCaptures.length === 0) {
    log('Nenhuma captura encontrada. Execute primeiro o script de captura.');
    process.exit(0);
  }

  // Filtra mensagens alvo
  const targets = filterTargetMessages(allCaptures);
  const candidates = targets.filter(t => t.validation.proceed);
  const rejected = targets.filter(t => !t.validation.proceed);

  log(`───────────────────────────────────────────────────────────────`);
  log(`Candidatos selecionados: ${candidates.length}`);
  log(`Rejeitados por validação: ${rejected.length}`);
  log(`───────────────────────────────────────────────────────────────`);

  // Aplica limit
  const limited = limit ? candidates.slice(0, limit) : candidates;
  if (limit && candidates.length > limit) {
    logWarn(`Aplicado limite de ${limit} exclusões. ${candidates.length - limit} candidatos restantes.`);
  }

  // Ordena por timestamp decrescente (mais recentes primeiro)
  limited.sort((a, b) => (b.entry.timestamp || 0) - (a.entry.timestamp || 0));

  // Exibe os candidatos
  if (dryRun) {
    log('───────────────────────────────────────────────────────────────');
    log('DRY-RUN: mostrando o que SERIA excluido (sem executar):');
    log('───────────────────────────────────────────────────────────────');
    for (const t of limited) {
      const e = t.entry;
      log(`  [${e.contentType}] ${e.messageId} de ${e.senderJid}`);
      log(`    Grupo: ${e.groupId}`);
      log(`    Timestamp: ${new Date(e.timestamp).toISOString()}`);
      log(`    Score: ${t.signals.score} | Sinais: ${t.signals.signals.join(', ')}`);
      log(`    Texto: ${e.textPreview ? e.textPreview.slice(0, 150) + (e.textPreview.length > 150 ? '...' : '') : '(sem texto)'}`);
      log('');
    }
    log(`Total no dry-run: ${limited.length} mensagens`);
    log('Nenhuma exclusão foi executada.');
    process.exit(0);
  }

  // Executa exclusões
  log('───────────────────────────────────────────────────────────────');
  log('EXECUTANDO DELETES SILENCIOSOS...');
  log('───────────────────────────────────────────────────────────────');

  const results: Array<{
    messageId: string;
    senderJid: string;
    groupId: string;
    contentType: string;
    score: number;
    signals: string[];
    success: boolean;
    error?: string;
    timestamp: string;
  }> = [];

  for (const t of limited) {
    const e = t.entry;
    log(`Deletando: ${e.messageId} (${e.contentType}) de ${e.senderJid} [score=${t.signals.score}]`);

    const deleteResult = await deleteMessage(
      e.messageId,
      e.participant || e.senderJid,
      e.fromMe || false,
      e.groupId || e.remoteJid,
    );

    results.push({
      messageId: e.messageId,
      senderJid: e.senderJid,
      groupId: e.groupId,
      contentType: e.contentType,
      score: t.signals.score,
      signals: t.signals.signals,
      success: deleteResult.success,
      error: deleteResult.error,
      timestamp: new Date().toISOString(),
    });

    if (deleteResult.success) {
      log(`  ✅ DELETE SUCCESS: ${e.messageId}`);
    } else {
      logError(`  ❌ DELETE FAILED: ${e.messageId} — ${deleteResult.error}`);
    }
  }

  // Summary
  const succeeded = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  log('===============================================================');
  log('RESUMO FINAL');
  log('───────────────────────────────────────────────────────────────');
  log(`Total de capturas analisadas: ${allCaptures.length}`);
  log(`Candidatos selecionados:    ${candidates.length}`);
  log(`Rejeitados por validação:   ${rejected.length}`);
  log(`Limite aplicado:            ${limit || 'nenhum'}`);
  log(`Exclusões executadas:       ${results.length}`);
  log(`Sucesso:                    ${succeeded.length}`);
  log(`Falhas:                     ${failed.length}`);
  log('───────────────────────────────────────────────────────────────');

  for (const r of results) {
    const status = r.success ? '✅' : '❌';
    log(`${status} ${r.messageId} [${r.contentType}] de ${r.senderJid} — score=${r.score} — ${r.success ? 'OK' : r.error}`);
  }

  log('===============================================================');

  // Salva resultado
  fs.mkdirSync(CAPTURE_DIR, { recursive: true });
  fs.writeFileSync(RESULT_FILE, JSON.stringify({
    executedAt: new Date().toISOString(),
    mode: dryRun ? 'dry-run' : forceMode ? 'force' : 'safe',
    filters: {
      specificGroup,
      specificSender,
      afterTimestamp,
      beforeTimestamp,
      limit,
    },
    summary: {
      totalCapturas: allCaptures.length,
      candidatosSelecionados: candidates.length,
      rejeitadosValidacao: rejected.length,
      exclusoesExecutadas: results.length,
      sucesso: succeeded.length,
      falhas: failed.length,
    },
    candidates: candidates.map(c => ({
      messageId: c.entry.messageId,
      senderJid: c.entry.senderJid,
      groupId: c.entry.groupId,
      contentType: c.entry.contentType,
      score: c.signals.score,
      signals: c.signals.signals,
      validationError: c.validation.error,
    })),
    results,
  }, null, 2), 'utf-8');

  log(`Resultado salvo em: ${RESULT_FILE}`);

  if (succeeded.length > 0) {
    log('✅ MENSAGENS EXCLUÍDAS SILENCIOSAMENTE COM SUCESSO');
  } else if (results.length === 0) {
    log('⚠️ NENHUMA MENSAGEM CANDIDATA ENCONTRADA PARA EXCLUIR');
  } else {
    log('❌ NENHUMA MENSAGEM FOI EXCLUÍDA COM SUCESSO');
  }

  log('===============================================================');

  // Encerra com código de erro se houve falhas não recuperáveis
  if (failed.length > 0 && succeeded.length === 0) {
    process.exit(1);
  }
}

main().catch(err => {
  logError(`Erro fatal: ${err.message || err}`);
  process.exit(1);
});
