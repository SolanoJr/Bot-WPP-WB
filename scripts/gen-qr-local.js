const { makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode');
const fs = require('fs');
const path = require('path');

const AUTH_DIR = path.join(process.cwd(), 'sessions/558581344211');
const QR_PATH = path.join(process.cwd(), 'qr_wpp.png');

async function main() {
  try { fs.rmSync(AUTH_DIR, { recursive: true }); } catch {}
  fs.mkdirSync(AUTH_DIR, { recursive: true });

  console.log('=== Bot-WPP QR + Pairing Code Generator ===');
  console.log('Auth Dir:', AUTH_DIR);
  console.log('QR Path:', QR_PATH);
  console.log('');

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  
  const sock = makeWASocket({
    auth: state,
    browser: ['WarriorBlack', 'Desktop', '1.0'],
    syncFullHistory: false,
    markOnlineOnConnect: false,
    connectTimeoutMs: 120000,
  });

  sock.ev.on('creds.update', saveCreds);

  let qrGenerated = false;

  // Try to generate pairing code AFTER ws opens but BEFORE QR timeout
  sock.ev.on('connection.update', async (update) => {
    const { connection, qr } = update;

    console.log('connection.update:', connection);

    if (qr && !qrGenerated) {
      qrGenerated = true;
      console.log('\n[QR] QR Code recebido!');
      try {
        await qrcode.toFile(QR_PATH, qr, { width: 600, margin: 4 });
        console.log('[QR] Salvo em:', QR_PATH);
        console.log('[QR] Tamanho:', fs.statSync(QR_PATH).size, 'bytes');
      } catch (err) {
        console.error('[QR] Erro ao salvar:', err.message);
      }
      
      console.log('\n╔════════════════════════════════════════════════════════════╗');
      console.log('║  📱 QR CODE GERADO! Salvo em: qr_wpp.png                  ║');
      console.log('╠════════════════════════════════════════════════════════════╣');
      console.log('║  Escaneie com: WhatsApp > Ajustes > Dispositivos          ║');
      console.log('║  conectados > Conectar dispositivo > Vincular pelo QR    ║');
      console.log('╚════════════════════════════════════════════════════════════╝\n');

      // Generate pairing code IMMEDIATELY (while ws is still alive)
      console.log('[PAIRING] Gerando pairing code...');
      try {
        const code = await sock.requestPairingCode('558581344211');
        console.log('');
        console.log('╔════════════════════════════════════════════════════════════╗');
        console.log('║  📱 PAIRING CODE (8 dígitos)                              ║');
        console.log('╠════════════════════════════════════════════════════════════╣');
        console.log(`║                  CÓDIGO:  ${code}                         ║`);
        console.log('╠════════════════════════════════════════════════════════════╣');
        console.log('║  1. WhatsApp > Ajustes > Dispositivos conectados          ║');
        console.log('║  2. Conectar dispositivo > Digitar código                 ║');
        console.log('╚════════════════════════════════════════════════════════════╝\n');
      } catch (err) {
        console.error('[PAIRING] Erro:', err.message);
        console.log('[PAIRING] QR já gerado acima. Use o QR code ou aguarde novo código.\n');
      }
    }

    if (connection === 'open') {
      console.log('\n[CONNECTED] ✅ CONECTADO COM SUCESSO!');
      setTimeout(() => {
        console.log('[CONNECTED] Credenciais salvas. Encerrando...');
        process.exit(0);
      }, 3000);
    }

    if (connection === 'close') {
      const code = update.lastDisconnect?.error?.output?.statusCode;
      console.log(`[CLOSE] Conexão fechada: ${code}`);
      if (code === 408) {
        console.log('[CLOSE] QR expirou. Execute novamente para gerar novo QR.\n');
      }
      setTimeout(() => process.exit(1), 2000);
    }
  });
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});