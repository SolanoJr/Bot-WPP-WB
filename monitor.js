#!/usr/bin/env node
/**
 * bot-wpp-monitor.js — Monitor em tempo real com:
 * - Verificador automático se QR foi escaneado (poller every 5s)
 * - Barra de progresso do carregamento de mensagens
 * - Status detalhado da conexão
 *
 * Uso: node monitor.js
 * Ctrl+C para parar.
 */
'use strict';
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuração
const AUTH_DIR = '/home/solanojr/bot-wpp/sessions/558581344211';
const OUT_LOG = '/home/solanojr/.pm2/logs/bot-wpp-stable.out.log';
const ERR_LOG = '/home/solanojr/.pm2/logs/bot-wpp-stable.err.log';
const SCAN_INTERVAL_MS = 5000;

// Estados com emojis e cores
const STATES = {
  CHECKING:   { icon: '🔍', label: 'Verificando...', color: '\x1b[90m' },
  QR_PENDING: { icon: '⏳', label: 'QR pendente — aguardando escaneamento', color: '\x1b[33m' },
  QR_SCANNED: { icon: '📱', label: 'QR escaneado — credenciais sendo salvas', color: '\x1b[36m' },
  AUTH_SAVE:  { icon: '🔐', label: 'Credenciais salvas — estabelecendo conexão', color: '\x1b[34m' },
  CONNECTING: { icon: '🔌', label: 'Conectando ao WhatsApp...', color: '\x1b[33m' },
  CONNECTED:  { icon: '✅', label: 'WhatsApp conectado!', color: '\x1b[32m' },
  ONLINE:     { icon: '🟢', label: 'Online — pronto para comandos', color: '\x1b[32m' },
  OFFLINE:    { icon: '🔴', label: 'Offline', color: '\x1b[31m' },
  ERROR:      { icon: '❌', label: 'Erro de conexão', color: '\x1b[31m' },
  TIMEOUT:    { icon: '⏰', label: 'Timeout — QR não escaneado em tempo', color: '\x1b[33m' },
};

// Barra de progresso da conexão (0-100%)
const PROGRESS_STEPS = [
  { state: 'QR_PENDING', pct: 0 },
  { state: 'QR_SCANNED', pct: 20 },
  { state: 'AUTH_SAVE',  pct: 40 },
  { state: 'CONNECTING', pct: 60 },
  { state: 'CONNECTED',  pct: 80 },
  { state: 'ONLINE',     pct: 100 },
];

function now() {
  const d = new Date();
  return d.toISOString().replace('T', ' ').slice(0, 19) + '.' + String(d.getMilliseconds()).padStart(3, '0');
}

function run(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf-8', timeout: 10000, cwd: '/home/solanojr/bot-wpp' }).trim();
  } catch (e) {
    return (e.stdout || e.message || '').trim();
  }
}

function bar(length, pct) {
  const filled = Math.round((pct / 100) * length);
  const empty = length - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

function getProgress(state) {
  const step = PROGRESS_STEPS.find(s => s.state === state);
  return step ? step.pct : 0;
}

function check() {
  // PM2 status
  const pm2Out = run('pm2 status bot-wpp 2>&1');
  const pm2Online = pm2Out.includes('online');
  const pidMatch = pm2Out.match(/│\s*16\s*│\s*bot-wpp\s*│.*?│\s*(\d+)\s*│/);
  const pid = pidMatch ? pidMatch[1] : pm2Out.match(/pid\s+(\d+)/)?.[1] || '?';

  // Auth dir
  const authLs = run(`ls -1 ${AUTH_DIR} 2>&1`);
  const files = authLs.split('\n').filter(f => f.trim() && !f.includes('total'));
  const hasCredsJson = files.some(f => f.includes('creds.json'));
  const hasQR = files.some(f => f.includes('qr.png'));

  // Verificar conteúdo do creds.json para saber se sessão é válida
  let credsValid = false;
  let credsInfo = 'desconhecido';
  try {
    if (hasCredsJson) {
      const credsData = JSON.parse(fs.readFileSync(path.join(AUTH_DIR, 'creds.json'), 'utf-8'));
      const hasMe = !!credsData.me?.id;
      const hasRegistered = !!credsData.registered;
      credsValid = hasMe && hasRegistered;
      credsInfo = hasMe ? `me.id=${credsData.me.id}` : 'sem me.id';
      if (hasRegistered) credsInfo += ', registered=true';
    }
  } catch (e) {
    credsInfo = 'erro ao ler creds.json';
  }

  // Logs
  const logOut = run(`tail -5 ${OUT_LOG} 2>&1`);
  const logErr = run(`tail -3 ${ERR_LOG} 2>&1`);

  // Mensagens processadas (contagem de eventos nos logs)
  const msgLog = run(`grep -c 'MESSAGES_UPDATE_EVENT\|MESSAGES_DELETE_EVENT\|messages.upsert' ${OUT_LOG} 2>/dev/null || echo 0`);
  const msgCount = parseInt(msgLog) || 0;

  // Determinar estado atual
  let state;
  if (!pm2Online) {
    state = 'OFFLINE';
  } else if (logOut.includes('Conexão estabelecida') || logOut.includes('✅ Conexão')) {
    state = 'CONNECTED';
  } else if (logOut.includes('Baileys iniciado') || logOut.includes('pronto')) {
    if (credsValid) {
      state = 'CONNECTED';
    } else {
      state = 'CONNECTING';
    }
  } else if (credsValid) {
    state = 'CONNECTED';
  } else if (hasQR) {
    state = 'QR_PENDING';
  } else {
    state = 'CONNECTING';
  }

  if (logOut.includes('Timed Out') || logOut.includes('Timeout')) {
    state = 'TIMEOUT';
  }
  if (logOut.includes('Connection Failure') && !credsValid) {
    state = 'ERROR';
  }

  return {
    state,
    pid,
    pm2Online,
    files: files.length,
    hasCredsJson,
    hasQR,
    credsValid,
    credsInfo,
    logOut,
    logErr,
    msgCount
  };
}

// ─── MAIN ───
console.log('');
console.log('╔══════════════════════════════════════════════════════════════════════╗');
console.log('║         🤖 BOT-WPP MONITOR — WhatsApp 558581344211                ║');
console.log('║         Verificador QR + Barra de Progresso em Tempo Real          ║');
console.log('╚══════════════════════════════════════════════════════════════════════╝');
console.log('');
console.log('📋 Legenda:');
console.log('  🔍 Verificando    ⏳ QR pendente    📱 QR escaneado');
console.log('  🔐 Credenciais     🔌 Conectando     ✅ Conectado');
console.log('  🟢 Online          🔴 Offline        ❌ Erro');
console.log('');
console.log('⏲️ Monitorando a cada ' + (SCAN_INTERVAL_MS/1000) + 's... (Ctrl+C para parar)');
console.log('');

let lastState = null;
let startTime = Date.now();
let iteration = 0;

const interval = setInterval(() => {
  iteration++;
  const info = check();
  const elapsed = Math.floor((Date.now() - startTime) / 1000);
  const stateDef = STATES[info.state] || STATES.CHECKING;
  const progress = getProgress(info.state);

  // Mudança de estado
  if (info.state !== lastState) {
    console.log(`\n${stateDef.color}[${now()}] ═══ ${stateDef.icon} ${stateDef.label} ═══\x1b[0m`);
    lastState = info.state;
  }

  // Limpar tela a cada 10 iterações para não ficar muito grande
  if (iteration % 10 === 0) {
    process.stdout.write('\x1b[2J\x1b[H');
    console.log('╔══════════════════════════════════════════════════════════════════════╗');
    console.log('║         🤖 BOT-WPP MONITOR — WhatsApp 558581344211                ║');
    console.log('╚══════════════════════════════════════════════════════════════════════╝');
    console.log('');
  }

  // Status line
  const pm2Status = info.pm2Online ? '🟢 online' : '🔴 offline';

  console.log(`${stateDef.color}[${now()}]${'\x1b[0m'} ${stateDef.icon} PM2: ${pm2Status} | pid=${info.pid} | auth:${info.files} arq. | ${info.credsInfo}${info.credsValid ? ' ✓' : ''}`);
  console.log(`${stateDef.color}[${now()}]${'\x1b[0m'} 📊 Progresso de conexão: [${bar(20, progress)}] ${progress}% — ${stateDef.label}`);

  // Barra de progresso de mensagens
  console.log(`${stateDef.color}[${now()}]${'\x1b[0m'} 📥 Progresso de mensagens: [${bar(20, Math.min(100, info.msgCount * 2))}] ${Math.min(100, info.msgCount * 2)}% — ~${info.msgCount} eventos processados`);

  // Detalhes extras
  if (info.hasCredsJson) {
    console.log(`${stateDef.color}[${now()}]${'\x1b[0m'} 🔑 Credenciais:SALVAS (${info.credsInfo})`);
  }
  if (info.hasQR && !info.hasCredsJson) {
    console.log(`${stateDef.color}[${now()}]${'\x1b[0m'} 📱 QR gerado mas NÃO escaneado — aguardando...`);
    console.log(`${stateDef.color}[${now()}]${'\x1b[0m'} 💡 QR em: /home/solanojr/bot-wpp/sessions/558581344211/qr.png`);
  }
  if (info.state === 'CONNECTED' || info.state === 'ONLINE') {
    console.log(`${stateDef.color}[${now()}]${'\x1b[0m'} ✅ WhatsApp CONECTADO — bot operational`);
  }
  if (info.state === 'TIMEOUT') {
    console.log(`${stateDef.color}[${now()}]${'\x1b[0m'} ⏰ Timeout — QR não escaneado — aguarde QR novo ou escaneie o atual`);
  }
  if (info.logErr.includes('Error') || info.logErr.includes('ERROR')) {
    const errLines = info.logErr.split('\n').filter(l => l.includes('ERROR') || l.includes('Error'));
    if (errLines.length > 0) {
      console.log(`${stateDef.color}[${now()}]${'\x1b[0m'} ❌ ${errLines[errLines.length-1].trim().slice(0, 120)}`);
    }
  }

}, SCAN_INTERVAL_MS);

process.on('SIGINT', () => {
  clearInterval(interval);
  const elapsed = Math.floor((Date.now() - startTime) / 1000);
  console.log(`\n⏹ Monitoramento parado após ${elapsed}s (${iteration} verificações).`);
  process.exit(0);
});
