const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode');
const fs = require('fs');
const path = require('path');

const AUTH_DIR = path.join(process.cwd(), 'sessions/558581344211');

let sock = null;
let isConnected = false;

function log(msg) {
  const ts = new Date().toISOString().substring(11, 19);
  console.log(`[${ts}] ${msg}`);
}

async function saveQR(qr) {
  try {
    const qrString = await qrcode.toString(qr, { type: 'utf8', margin: 2, scale: 2 });
    log('');
    log('╔════════════════════════════════════════════════════════════╗');
    log('║  📱 QR CODE (ESCANE COM O WHATSAPP)                       ║');
    log('╠════════════════════════════════════════════════════════════╣');
    log('║  WhatsApp > Ajustes > Dispositivos conectados             ║');
    log('║  > Conectar dispositivo > Vincular pelo QR Code           ║');
    log('╚════════════════════════════════════════════════════════════╝');
    log('');
    log(qrString);
    log('');
  } catch (e) {
    log('[QR] Erro ASCII: ' + e.message);
  }
}

async function startConnection() {
  log('Iniciando nova sessão...');

  try { fs.rmSync(AUTH_DIR, { recursive: true }); } catch {}
  fs.mkdirSync(AUTH_DIR, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  sock = makeWASocket({
    auth: state,
    browser: ['WarriorBlack', 'Desktop', '1.0'],
    qrTimeout: 60000,
    syncFullHistory: false,
    markOnlineOnConnect: false,
    connectTimeoutMs: 120000,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, qr } = update;

    if (qr) {
      log('QR Code gerado!');
      await saveQR(qr);
      log('Aguardando scan... (60s)');
    }

    if (connection === 'open') {
      isConnected = true;
      log('');
      log('✅✅✅ CONECTADO!');
      await saveCreds();
      setTimeout(() => process.exit(0), 5000);
    }

    if (connection === 'close') {
      const reason = update.lastDisconnect?.error?.output?.statusCode;
      log('Fechada: ' + reason);
      if (isConnected) return;
      log('Gerando novo QR em 3s...');
      setTimeout(startConnection, 3000);
    }
  });
}

process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));

log('═══════════════════════════════════════');
log(' Bot-WPP Connect');
log('═══════════════════════════════════════');
startConnection();
