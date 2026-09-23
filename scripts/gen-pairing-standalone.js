// Generate pairing code or QR using Baileys directly
const { makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode');

async function main() {
  const phoneNumber = process.env.WPP_PHONE_NUMBER || '558581344211';
  const authDir = './sessions/558581344211';

  console.log('=== Gerando Pairing Code/QR ===');
  console.log('Número:', phoneNumber);

  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  console.log('Auth state carregado');

  const sock = makeWASocket({
    auth: state,
    browser: ['WarriorBlack', 'Desktop', '1.0'],
  });

  sock.ev.on('creds.update', saveCreds);
  
  let pairingCodeGenerated = false;
  let qrGenerated = false;

  sock.ev.on('connection.update', async (update) => {
    console.log('connection.update:', JSON.stringify({
      connection: update.connection,
      qr: update.qr ? 'QR present' : 'no qr',
      isNewLogin: update.isNewLogin,
    }).substring(0, 200));
    
    // QR Code received
    if (update.qr && !qrGenerated) {
      qrGenerated = true;
      console.log('QR recebido!');
      try {
        const qrPath = './qr_wpp.png';
        await qrcode.toFile(qrPath, update.qr, { width: 512, margin: 2 });
        console.log('QR salvo em:', qrPath);
      } catch (err) {
        console.error('Erro ao salvar QR:', err.message);
      }
    }
    
    // When connection is established, try pairing code
    if (update.connection === 'open' && !pairingCodeGenerated && !state.registered) {
      pairingCodeGenerated = true;
      console.log('Conectado mas não logado — gerando pairing code...');
      try {
        const code = await sock.requestPairingCode(phoneNumber);
        console.log('');
        console.log('╔════════════════════════════════════════════════════════════╗');
        console.log('║  📱 PAIRING CODE GERADO!                                  ║');
        console.log('╠════════════════════════════════════════════════════════════╣');
        console.log(`║                  CÓDIGO:  ${code}                         ║`);
        console.log('╠════════════════════════════════════════════════════════════╣');
        console.log('║  1. WhatsApp > Ajustes > Dispositivos conectados          ║');
        console.log('║  2. Conectar dispositivo > Digitar código                 ║');
        console.log('╚════════════════════════════════════════════════════════════╝');
        console.log('');
      } catch (err) {
        console.error('Erro ao gerar pairing code:', err.message);
      }
    }

    if (update.connection === 'close') {
      console.log('Conexão fechada');
      setTimeout(() => process.exit(0), 2000);
    }
  });

  // Try generating pairing code after 10s if not logged in
  setTimeout(async () => {
    if (!pairingCodeGenerated && !state.registered) {
      console.log('Timeout 10s: tentando gerar pairing code...');
      try {
        const code = await sock.requestPairingCode(phoneNumber);
        pairingCodeGenerated = true;
        console.log('');
        console.log('╔════════════════════════════════════════════════════════════╗');
        console.log('║  📱 PAIRING CODE GERADO!                                  ║');
        console.log('╠════════════════════════════════════════════════════════════╣');
        console.log(`║                  CÓDIGO:  ${code}                         ║`);
        console.log('╠════════════════════════════════════════════════════════════╣');
        console.log('║  1. WhatsApp > Ajustes > Dispositivos conectados          ║');
        console.log('║  2. Conectar dispositivo > Digitar código                 ║');
        console.log('╚════════════════════════════════════════════════════════════╝');
        console.log('');
      } catch (err) {
        console.error('Erro ao gerar pairing code:', err.message);
      }
    }
  }, 10000);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});