import sys

filepath = '/home/solanojr/bot-wpp/src/platforms/whatsapp/baileys/BaileysConnection.ts'

with open(filepath, 'r') as f:
    content = f.read()

# Replace the retry-based pairing code with event-based (connecting state)
old = """    // ═══════════════════════════════════════════════════════════════
    // PAIRING CODE — solicitado imediatamente após criar o socket
    // Formato: 8 caracteres alfanuméricos (XXXX-YYYY)
    // ═══════════════════════════════════════════════════════════════
    const hasCreds = !!(driverState?.creds?.me?.id || driverState?.creds?.registered);
    if (!hasCreds) {
      const phoneNumber = this.getPhoneNumber();
      logInfo('');
      logInfo('╔════════════════════════════════════════════════════════════╗');
      logInfo('║  🔗 WARRIORBLACK — PAIRING CODE                           ║');
      logInfo('╠════════════════════════════════════════════════════════════╣');
      logInfo(`║  Número: ${phoneNumber}                                    `);
      logInfo('║  Solicitando código de 8 dígitos...                       ║');
      logInfo('╚════════════════════════════════════════════════════════════╝');
      logInfo('');
      // Retry com 3 tentativas (WebSocket pode ainda não estar pronto)
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const code = await driver.requestPairingCode(phoneNumber);
          logInfo('');
          logInfo('╔════════════════════════════════════════════════════════════╗');
          logInfo('║  📱 PAIRING CODE GERADO!                                  ║');
          logInfo('╠════════════════════════════════════════════════════════════╣');
          logInfo(`║                  CÓDIGO:  ${code}                         `);
          logInfo('╠════════════════════════════════════════════════════════════╣');
          logInfo('║  1. Ajustes > Aparelhos conectados > Conectar aparelho ║');
          logInfo('║  2. Digite o código acima (expira em 2 minutos)        ║');
          logInfo('╚════════════════════════════════════════════════════════════╝');
          logInfo('');
          this.onPairingCode?.(code);
          break;
        } catch (pairingErr: any) {
          logWarning(`[BaileysConnection] Pairing Code tentativa ${attempt}/3 falhou: ${pairingErr?.message}`);
          if (attempt < 3) {
            await new Promise(r => setTimeout(r, 3000));
          } else {
            logError('[BaileysConnection] Pairing Code falhou após 3 tentativas');
          }
        }
      }
    }"""

new = """    // ═══════════════════════════════════════════════════════════════
    // PAIRING CODE — solicitado quando a conexão WA está conectando
    // Formato: 8 caracteres alfanuméricos (XXXX-YYYY)
    // ═══════════════════════════════════════════════════════════════
    const hasCreds = !!(driverState?.creds?.me?.id || driverState?.creds?.registered);
    if (!hasCreds) {
      const phoneNumber = this.getPhoneNumber();
      logInfo('');
      logInfo('╔════════════════════════════════════════════════════════════╗');
      logInfo('║  🔗 WARRIORBLACK — PAIRING CODE                           ║');
      logInfo('╠════════════════════════════════════════════════════════════╣');
      logInfo(`║  Número: ${phoneNumber}                                    `);
      logInfo('║  Aguardando conexão WA para solicitar código...            ║');
      logInfo('╚════════════════════════════════════════════════════════════╝');
      logInfo('');

      const pairingHandler = async (update: any) => {
        if (update.connection === 'connecting' || update.connection === 'open') {
          driver.ev.off('connection.update', pairingHandler);
          logInfo('[BaileysConnection] WebSocket WA pronto — solicitando Pairing Code');
          // Retry com 3 tentativas
          for (let attempt = 1; attempt <= 3; attempt++) {
            try {
              const code = await driver.requestPairingCode(phoneNumber);
              logInfo('');
              logInfo('╔════════════════════════════════════════════════════════════╗');
              logInfo('║  📱 PAIRING CODE GERADO!                                  ║');
              logInfo('╠════════════════════════════════════════════════════════════╣');
              logInfo(`║                  CÓDIGO:  ${code}                         `);
              logInfo('╠════════════════════════════════════════════════════════════╣');
              logInfo('║  1. Ajustes > Aparelhos conectados > Conectar aparelho ║');
              logInfo('║  2. Digite o código acima (expira em 2 minutos)        ║');
              logInfo('╚════════════════════════════════════════════════════════════╝');
              logInfo('');
              this.onPairingCode?.(code);
              break;
            } catch (pairingErr: any) {
              logWarning(`[BaileysConnection] Pairing Code tentativa ${attempt}/3 falhou: ${pairingErr?.message}`);
              if (attempt < 3) {
                await new Promise(r => setTimeout(r, 3000));
              } else {
                logError('[BaileysConnection] Pairing Code falhou após 3 tentativas');
              }
            }
          }
        }
      };
      driver.ev.on('connection.update', pairingHandler);
    }"""

if old in content:
    content = content.replace(old, new)
    with open(filepath, 'w') as f:
        f.write(content)
    print('REPLACED SUCCESSFULLY')
else:
    print('OLD BLOCK NOT FOUND')
    sys.exit(1)