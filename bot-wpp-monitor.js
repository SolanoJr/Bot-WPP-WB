#!/usr/bin/env node
'use strict';
const { execSync } = require('child_process');
const fs = require('fs');

const AUTH_DIR = '/home/solanojr/bot-wpp/sessions/558581344211';
const OUT_LOG = '/home/solanojr/.pm2/logs/bot-wpp-stable.out.log';
const ERR_LOG = '/home/solanojr/.pm2/logs/bot-wpp-stable.err.log';

const STATES = {
  QR_PENDING: '⏳ QR pendente — aguardando escaneamento',
  QR_SCANED:  '🔑 QR escaneado — autenticando',
  AUTH_SAVE:  '🔐 Credenciais sendo salvas',
  CONNECTING: '🔌 Conectando ao WhatsApp',
  CONNECTED:  '✅ WhatsApp conectado',
  ONLINE:     '🟢 Online — pronto para comandos',
  OFFLINE:    '🔴 Offline',
  TIMEOUT:    '⏰ Timeout — QR não escaneado em 120s',
  ERROR:      '❌ Erro de conexão',
};

let lastState = null;
const start = Date.now();

const now = () => new Date().toISOString().replace('T',' ').slice(0,19);
const run = (cmd) => {
  try {
    return execSync(cmd, { encoding:'utf-8', timeout:10000, cwd:'/home/solanojr/bot-wpp' }).trim();
  } catch(e) {
    return (e.stdout || e.message || '').trim();
  }
};

const bar = (p, t) => {
  const pct = Math.min(100, Math.round(p/t*100));
  const f = Math.floor(p/t*20);
  return '[ ' + '█'.repeat(f) + '░'.repeat(20-f) + ' ] ' + pct + '%';
};

function check() {
  const st = run('pm2 status bot-wpp 2>&1');
  const on = st.includes('online');
  const pid = st.match(/bot-wpp.*?pid\s+(\d+)/)?.[1] || '?';
  const ls = run('ls -la ' + AUTH_DIR + ' 2>&1');
  const files = ls.split('\n').filter(l => l.trim() && !l.includes('total') && !l.includes('drwx'));
  const hasQr = files.some(l => l.includes('qr.png'));
  const hasCreds = files.length > (hasQr ? 1 : 0);
  const logO = run('tail -5 ' + OUT_LOG + ' 2>&1');
  const logE = run('tail -3 ' + ERR_LOG + ' 2>&1');

  let state;
  if (!on) state = STATES.OFFLINE;
  else if (logO.includes('Conexão estabelecida') || logO.includes('✅ WhatsApp')) state = STATES.ONLINE;
  else if (hasCreds) state = STATES.CONNECTING;
  else if (files.length > 1) state = STATES.AUTH_SAVE;
  else if (hasQr) state = STATES.QR_SCANED;
  else state = STATES.QR_PENDING;

  if (logO.includes('Timed Out') || logO.includes('Timeout')) state = STATES.TIMEOUT;
  if (logO.includes('Connection Failure') || logO.includes('401')) state = STATES.ERROR;

  return { state, pid, on, files: files.length, hasQr, hasCreds, logO, logE };
}

console.log('╔══════════════════════════════════════════════════╗');
console.log('║   🤖 BOT-WPP MONITOR — 558581344211            ║');
console.log('╚══════════════════════════════════════════════════╝');
console.log('⏲️ Iniciando... (Ctrl+C para parar)\n');

const iv = setInterval(() => {
  const info = check();
  const elapsed = Math.floor((Date.now() - start) / 1000);

  let prog = 0, total = 5;
  if (info.state === STATES.QR_PENDING) prog = 0;
  else if (info.state === STATES.QR_SCANED) prog = 1;
  else if (info.state === STATES.AUTH_SAVE) prog = 2;
  else if (info.state === STATES.CONNECTING) prog = 3;
  else if (info.state === STATES.ONLINE || info.state === STATES.CONNECTED) prog = 5;
  else prog = 0;

  if (info.state !== lastState) {
    console.log('\n[' + now() + '] ═══ ' + info.state + ' ═══');
    lastState = info.state;
  }

  const icon = info.on ? '🟢' : '🔴';
  const authInfo = info.files > 0 ? info.files + ' arq.' : '0 arq. (vazio)';

  console.log('[' + now() + '] ' + icon + ' PM2:' + (info.on ? 'online' : 'offline') +
    ' | pid=' + info.pid + ' | auth:' + authInfo + ' | ' + bar(prog, total) + ' | ' + info.state);

  if (info.state === STATES.QR_PENDING || info.state === STATES.QR_SCANED) {
    const codeLine = info.logO.split('\n').find(l => l.includes('CÓDIGO:'));
    if (codeLine) {
      const m = codeLine.match(/CÓDIGO:\s+(\S+)/);
      if (m) console.log('  📱 Código: ' + m[1] + '  →  qr.png ou digite manualmente');
    }
  }
  if (info.state === STATES.ONLINE || info.state === STATES.CONNECTED) {
    console.log('  ✅ WhatsApp autenticado!');
    console.log('  📁 Auth dir: ' + info.files + ' arquivos');
  }
  if (info.state === STATES.TIMEOUT) {
    console.log('  ⏰ Timeout — QR não escaneado em 120s');
    console.log('  💡 qr.png em: /home/solanojr/bot-wpp/sessions/558581344211/qr.png');
  }
  if (info.state === STATES.ERROR) {
    console.log('  ❌ Erro de conexão');
  }

  if (info.logO.includes('Conexão estabelecida')) console.log('  🎯 connection=open CONFIRMADO');
  if (info.hasCreds) console.log('  🔑 creds.update detectado — credenciais salvas');

  if (info.logE.includes('Error')) {
    const errLines = info.logE.split('\n').filter(l => l.includes('ERROR') || (l.includes('Error') && !l.includes('at ')));
    if (errLines.length) console.log('  🔴 ' + errLines[errLines.length-1].trim().slice(0, 120));
  }

}, 5000);

process.on('SIGINT', () => {
  clearInterval(iv);
  console.log('\n⏹ Parado. Tempo: ' + Math.floor((Date.now() - start)/1000) + 's');
  process.exit(0);
});
