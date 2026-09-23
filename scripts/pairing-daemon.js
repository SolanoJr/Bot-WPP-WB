const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');

const AUTH_DIR = path.join(process.cwd(), 'sessions/558581344211');

let sock = null;
let lastCode = null;
let isConnected = false;

function log(msg) {
  const ts = new Date().toISOString().substring(11, 19);
  console.log(`[${ts}] ${msg}`);
}

async function startSession() {
  log('INICIANDO SESSÃO');

  // Clean auth dir
  try { fs.rmSync(AUTH_DIR, { recursive: true }); } catch {}
  fs.mkdirSync(AUTH_DIR, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  sock = makeWASocket({
    auth: state,
    browser: ['WarriorBlack', 'Desktop', '1.0'],
    syncFullHistory: false,
    markOnlineOnConnect: false,
    connectTimeoutMs: 60000,
    qrTimeout: 0, // No QR timeout
  });

  sock.ev.on('creds.update', saveCreds);

  // Generate pairing code once and keep retrying on failure
  const tryPairingCode = async () => {
    if (isConnected) return;
    try {
      const code = await sock.requestPairingCode('558581344211');
      if (code && code !== lastCode) {
        lastCode = code;
        log('');
        log('╔════════════════════════════════════════════════════════════╗');
        log('║  🔢 PAIRING CODE: ' + code + '                                    ║');
        log('╠════════════════════════════════════════════════════════════╣');
        log('║  WhatsApp → Ajustes → Dispositivos conectados             ║');
        log('║  → Conectar dispositivo → Digitar código                  ║');
        log('╚════════════════════════════════════════════════════════════╝');
        log('');
        log('(Código válido por ~2 min. Este processo continuará rodando)');
      }
    } catch (e) {
      log('Pairing code retry: ' + e.message);
    }
    // Retry in 15 seconds if not connected
    if (!isConnected) {
      setTimeout(tryPairingCode, 15000);
    }
  };

  // Start trying after 2s (let ws connect first)
  setTimeout(tryPairingCode, 2000);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;

    log('connection: ' + connection);

    if (connection === 'open') {
      isConnected = true;
      log('');
      log('✅✅✅ CONECTADO COM SUCESSO!');
      log('Número: ' + (state.me?.id || 'unknown'));
      log('Salvando credenciais...');
      
      setTimeout(() => {
        log('Encerrando daemon.');
        process.exit(0);
      }, 5000);
    }

    if (connection === 'close') {
      const reason = lastDisconnect?.error?.output?.statusCode;
      log('Fechada: ' + reason);
      
      // If logged out, clean and restart
      if (reason === DisconnectReason.loggedOut || reason === 401) {
        try { fs.rmSync(AUTH_DIR, { recursive: true }); } catch {}
        isConnected = false;
        lastCode = null;
        setTimeout(startSession, 3000);
      }
    }
  });
}

process.on('SIGTERM', () => {
  log('Recebido SIGTERM. Saindo...');
  process.exit(0);
});

process.on('SIGINT', () => {
  log('Recebido SIGINT. Saindo...');
  process.exit(0);
});

log('═══════════════════════════════════════════════════');
log(' Bot-WPP Pairing Daemon - Rodando continuamente');
log(' Ctrl+C para parar');
log('═══════════════════════════════════════════════════');
log('');

startSession();
