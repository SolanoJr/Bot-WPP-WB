const { makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');

const AUTH_DIR = '/home/solanojr/bot-wpp/sessions/558581344211';

async function main() {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  🔗 WARRIORBLACK — GERAÇÃO DE QR CODE                     ║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log('║  Limpando sessão anterior...                              ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');

  try {
    if (fs.existsSync(AUTH_DIR)) {
      for (const f of fs.readdirSync(AUTH_DIR)) {
        fs.unlinkSync(path.join(AUTH_DIR, f));
      }
      console.log('✅ Sessão anterior limpa');
    }
  } catch (e) {
    console.log('⚠️ Erro ao limpar:', e.message);
  }

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  📱 GERANDO QR CODE...                                    ║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log('║  QR code será gerado abaixo em instantes                  ║');
  console.log('╚════════════════════════════════════════════════════════════╣');
  console.log('');

  const sock = makeWASocket({
    auth: state,
    browser: ['WarriorBlack', 'Desktop', '1.0'],
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    // QR code em base64
    if (update.qr) {
      console.log('');
      console.log('╔════════════════════════════════════════════════════════════╗');
      console.log('║  📱 ESCANEIE O QR CODE ABAIXO COM O WHATSAPP              ║');
      console.log('╠════════════════════════════════════════════════════════════╣');
      // Exibir QR code como ASCII art usando o módulo qrcode
      try {
        const QRCode = require('qrcode');
        QRCode.toString(update.qr, { type: 'terminal', small: true }, (err, url) => {
          if (!err) console.log(url);
          console.log('');
          console.log('╚════════════════════════════════════════════════════════════╝');
          console.log('');
        });
      } catch {
        console.log('QR (URL):', update.qr);
        console.log('');
        console.log('╚════════════════════════════════════════════════════════════╝');
        console.log('');
      }
    }
    
    if (update.connection === 'open') {
      console.log('');
      console.log('╔════════════════════════════════════════════════════════════╗');
      console.log('║  ✅ CONEXÃO ESTABELECIDA COM SUCESSO!                     ║');
      console.log('╠════════════════════════════════════════════════════════════╣');
      console.log('║  Bot conectado. Encerrando script.                        ║');
      console.log('╚════════════════════════════════════════════════════════════╝');
      console.log('');
      setTimeout(() => process.exit(0), 2000);
    }
    if (update.connection === 'close') {
      const reason = update.lastDisconnect?.error?.message || update.reason || 'desconhecido';
      const statusCode = update.lastDisconnect?.error?.output?.statusCode || 0;
      console.log(`Conexão encerrada: ${reason} (${statusCode})`);
    }
  });

  setTimeout(() => {
    console.log('⏰ Timeout expirou');
    process.exit(1);
  }, 120000);
}

main().catch(err => {
  console.error('Erro:', err.message);
  process.exit(1);
});
