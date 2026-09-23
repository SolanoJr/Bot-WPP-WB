// Generate QR/Pairing Code and keep alive for scanning
const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');

const PHONE_NUMBER = process.env.WPP_PHONE_NUMBER || '558581344211';
const AUTH_DIR = './sessions/558581344211';
const QR_PATH = path.join(AUTH_DIR, 'qr.png');
const TMP_QR = '/tmp/qr_wpp.png';

let reconnectAttempts = 0;
const MAX_RECONNECT = 3;

async function saveQR(qrData) {
  try {
    const qrcode = require('qrcode');
    await qrcode.toFile(TMP_QR, qrData, { width: 512, margin: 2 });
    console.log(`\n📱 QR SALVO EM: ${TMP_QR}`);
    console.log(`📱 TAMANHO: ${fs.statSync(TMP_QR).size} bytes\n`);
  } catch (err) {
    console.error('Erro ao salvar QR:', err.message);
  }
}

async function startSocket() {
  reconnectAttempts++;
  console.log(`\n=== Tentativa ${reconnectAttempts}/${MAX_RECONNECT} ===`);

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  console.log(`Auth state carregado (registered: ${state.registered})`);

  const sock = makeWASocket({
    auth: state,
    browser: ['WarriorBlack', 'Desktop', '1.0'],
    syncFullHistory: false,
    markOnlineOnConnect: false,
  });

  let pairingCodeRequested = false;
  let qrShown = false;

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr, isNewLogin } = update;

    // QR Code
    if (qr && !qrShown) {
      qrShown = true;
      console.log('\n📱 QR CODE GERADO!');
      await saveQR(qr);
    }

    // Pairing code (immediately after connecting)
    if (connection === 'connecting' && !pairingCodeRequested) {
      pairingCodeRequested = true;
      setTimeout(async () => {
        try {
          const code = await sock.requestPairingCode(PHONE_NUMBER);
          console.log('\n╔════════════════════════════════════════════════════════════╗');
          console.log('║  📱 PAIRING CODE (8 dígitos)                              ║');
          console.log('╠════════════════════════════════════════════════════════════╣');
          console.log(`║                  CÓDIGO:  ${code}                         ║`);
          console.log('╠════════════════════════════════════════════════════════════╣');
          console.log('║  WhatsApp > Ajustes > Dispositivos conectados > Conectar  ║');
          console.log('╚════════════════════════════════════════════════════════════╝\n');
        } catch (err) {
          console.log('Pairing code não disponível (normal se já logado)');
        }
      }, 3000);
    }

    // Connected
    if (connection === 'open') {
      console.log('\n✅ CONECTADO COM SUCESSO!');
      console.log(`Número: ${state.me?.id || 'desconhecido'}`);
      console.log(`Salvando credenciais...`);
      
      // Save and exit after a delay to allow creds to be written
      setTimeout(() => {
        console.log('✅ Credenciais salvas. Encerrando...');
        process.exit(0);
      }, 5000);
    }

    // Disconnected
    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      console.log(`\n❌ Conexão fechada: ${statusCode}`);
      
      if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
        console.log('Sessão expirada/limpa');
        // Clear and retry
        try { fs.rmSync(AUTH_DIR, { recursive: true }); } catch {}
        fs.mkdirSync(AUTH_DIR, { recursive: true });
      }
      
      if (reconnectAttempts < MAX_RECONNECT) {
        console.log('Tentando reconectar em 3s...');
        setTimeout(startSocket, 3000);
      } else {
        console.log('\n❌ Máximo de tentativas atingido. Encerrando.');
        process.exit(1);
      }
    }
  });
}

// Ensure auth dir exists
fs.mkdirSync(AUTH_DIR, { recursive: true });

console.log('=== Bot-WPP Pairing Code/QR Generator ===');
console.log(`Número: ${PHONE_NUMBER}`);
console.log(`Auth Dir: ${AUTH_DIR}`);

startSocket().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});

// Keep alive
process.on('SIGINT', () => {
  console.log('\nEncerrando...');
  process.exit(0);
});