const { makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode');
const fs = require('fs');
const path = require('path');

const AUTH_DIR = path.join(process.cwd(), 'sessions/558581344211');

async function main() {
  try { fs.rmSync(AUTH_DIR, { recursive: true }); } catch {}
  fs.mkdirSync(AUTH_DIR, { recursive: true });

  console.log('Iniciando...');

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  const sock = makeWASocket({
    auth: state,
    browser: ['WarriorBlack', 'Desktop', '1.0'],
    qrTimeout: 120000, // 2 minutos
    syncFullHistory: false,
    markOnlineOnConnect: false,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, qr } = update;

    if (qr) {
      try {
        const qrString = await qrcode.toString(qr, { type: 'utf8', margin: 2, scale: 2 });
        console.log('');
        console.log(qrString);
        console.log('');
        console.log('Escaneie com o WhatsApp! (2 min para escanear)');
      } catch (e) {}
    }

    if (connection === 'open') {
      console.log('CONECTADO!');
      await saveCreds();
      setTimeout(() => process.exit(0), 3000);
    }

    if (connection === 'close') {
      console.log('Fechado. Reconectando em 3s...');
      setTimeout(() => process.exit(1), 3000);
    }
  });
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
