const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');

const AUTH_DIR = path.join(process.cwd(), 'sessions/558581344211');

async function main() {
  try { fs.rmSync(AUTH_DIR, { recursive: true }); } catch {}
  fs.mkdirSync(AUTH_DIR, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  const sock = makeWASocket({
    auth: state,
    browser: ['WarriorBlack', 'Desktop', '1.0'],
    qrTimeout: 0,
    syncFullHistory: false,
    markOnlineOnConnect: false,
  });

  sock.ev.on('creds.update', saveCreds);

  let isConnected = false;

  sock.ev.on('connection.update', async (update) => {
    const { connection, qr } = update;

    if (qr) {
      // Generate QR as ASCII
      try {
        const qrcode = require('qrcode');
        const qrString = await qrcode.toString(qr, { type: 'utf8', margin: 2, scale: 2 });
        console.log(qrString);
        console.log('');
        console.log('╔════════════════════════════════════════════════════════════╗');
        console.log('║  📱 ESCANEE COM O WHATSAPP                                ║');
        console.log('╠════════════════════════════════════════════════════════════╣');
        console.log('║  1. WhatsApp > Ajustes > Dispositivos conectados          ║');
        console.log('║  2. Conectar dispositivo > Vincular pelo QR Code          ║');
        console.log('║  3. Aponte a câmera para o QR acima                       ║');
        console.log('╚════════════════════════════════════════════════════════════╝');
        console.log('');
      } catch (err) {
        console.error('Erro ao gerar QR ASCII:', err.message);
      }
    }

    if (connection === 'open') {
      isConnected = true;
      console.log('✅✅✅ CONECTADO!');
      setTimeout(() => process.exit(0), 3000);
    }

    if (connection === 'close') {
      const reason = update.lastDisconnect?.error?.output?.statusCode;
      console.log('Conexão fechada:', reason);
      setTimeout(() => process.exit(1), 2000);
    }
  });
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
