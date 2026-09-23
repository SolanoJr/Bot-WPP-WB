const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode');
const fs = require('fs');
const path = require('path');

const AUTH_DIR = path.join(process.cwd(), 'sessions/558581344211');
let sock = null;
let isConnected = false;
let attemptNum = 0;

function log(msg) {
  const ts = new Date().toISOString().substring(11, 19);
  console.log(`[${ts}] ${msg}`);
}

function logInfo(msg) { log(msg); }

async function saveQR(qr) {
  try {
    const qrString = await qrcode.toString(qr, { type: 'utf8', margin: 2, scale: 2 });
    logInfo('');
    logInfo('╔════════════════════════════════════════════════════════════╗');
    logInfo('║  📱 QR CODE (ESCANE COM O WHATSAPP)                       ║');
    logInfo('╠════════════════════════════════════════════════════════════╣');
    logInfo('║  WhatsApp > Ajustes > Dispositivos conectados             ║');
    logInfo('║  > Conectar dispositivo > Vincular pelo QR Code           ║');
    logInfo('╚════════════════════════════════════════════════════════════╝');
    logInfo('');
    logInfo(qrString);
    logInfo('');
  } catch (e) {
    log('[QR] Erro ASCII: ' + e.message);
  }
}

async function startConnection() {
  attemptNum++;
  log(`INICIANDO SESSÃO #${attemptNum}`);

  try { fs.rmSync(AUTH_DIR, { recursive: true }); } catch {}
  fs.mkdirSync(AUTH_DIR, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  sock = makeWASocket({
    auth: state,
    browser: ['WarriorBlack', 'Desktop', '1.0'],
    qrTimeout: 60000, // 1 minuto para dar tempo de escanear
    syncFullHistory: false,
    markOnlineOnConnect: false,
    connectTimeoutMs: 120000,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, qr } = update;

    if (qr) {
      log('QR Code recebido!');
      await saveQR(qr);
      log('Aguardando scan...');
    }

    if (connection === 'open') {
      isConnected = true;
      log('');
      log('✅✅✅ CONECTADO COM SUCESSO!');
      log('Salvando credenciais...');
      await saveCreds();
      setTimeout(() => process.exit(0), 5000);
    }

    if (connection === 'close') {
      const reason = update.lastDisconnect?.error?.output?.statusCode;
      log('Conexão fechada: ' + reason);
      if (isConnected) return;

      // QR expirou ou connection failed - retry
      if (reason === 408 || reason === 401 || !reason) {
        log('QR expirou. Gerando novo QR em 3s...');
        setTimeout(startConnection, 3000);
      } else {
        log('Reconectando em 5s...');
        setTimeout(startConnection, 5000);
      }
    }
  });
}

process.on('SIGTERM', () => { log('Saindo...'); process.exit(0); });
process.on('SIGINT', () => { log('Saindo...'); process.exit(0); });

log('═══════════════════════════════════════════════════');
log(' Bot-WPP QR Connect — Loop até conectar');
log('═══════════════════════════════════════════════════');
log('');

startConnection();
