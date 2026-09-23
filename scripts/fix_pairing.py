import re

with open('/home/solanojr/bot-wpp/src/platforms/whatsapp/baileys/BaileysConnection.ts', 'r') as f:
    content = f.read()

# Find and replace the old pairing code block (immediate request) with event-based
# The old block starts with the PAIRING CODE comment and ends before "Iniciar conexão"
old_start = "    // ═══════════════════════════════════════════════════════════════\n    // PAIRING CODE — autenticação via código de 8 caracteres"
new_start = "    // ═══════════════════════════════════════════════════════════════\n    // PAIRING CODE — solicitado quando a conexão WA está aberta"

if old_start in content:
    # Find the old block and replace it
    # The old block ends with the closing of the if (!hasCreds) block
    # We need to find the exact boundaries
    start_idx = content.index(old_start)
    
    # Find the end of the old block (before "// Iniciar conexão")
    end_marker = "    // Iniciar conexão — v7: socket conecta automaticamente ao ser criado."
    end_idx = content.index(end_marker, start_idx)
    
    old_block = content[start_idx:end_idx]
    
    new_block = """    // ═══════════════════════════════════════════════════════════════
    // PAIRING CODE — solicitado quando a conexão WA está aberta
    // e ainda não há credenciais válidas (não logado).
    // Format: 8 caracteres alfanuméricos (XXXX-YYYY)
    // ═══════════════════════════════════════════════════════════════
    const hasCreds = !!(driverState?.creds?.me?.id || driverState?.creds?.registered);
    if (!hasCreds) {
      driver.ev.once('connection.update', async (update: any) => {
        if (update.connection === 'open') {
          const phoneNumber = this.getPhoneNumber();
          logInfo('');
          logInfo('╔════════════════════════════════════════════════════════════╗');
          logInfo('║  🔗 WARRIORBLACK — PAIRING CODE                           ║');
          logInfo('╠════════════════════════════════════════════════════════════╣');
          logInfo(`║  Número: ${phoneNumber}                                    `);
          logInfo('║  Solicitando código de 8 dígitos...                       ║');
          logInfo('╚════════════════════════════════════════════════════════════╝');
          logInfo('');
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
          } catch (pairingErr: any) {
            logWarning(`[BaileysConnection] Pairing Code falhou: ${pairingErr?.message}`);
          }
        }
      });
    }

"""
    
    content = content[:start_idx] + new_block + content[end_idx:]
    
    with open('/home/solanojr/bot-wpp/src/platforms/whatsapp/baileys/BaileysConnection.ts', 'w') as f:
        f.write(content)
    print('REPLACED SUCCESSFULLY')
else:
    print('OLD BLOCK NOT FOUND')
    # Debug: print lines around the pairing code section
    lines = content.split('\n')
    for i, line in enumerate(lines[295:340], start=296):
        print(f'{i}: {repr(line)}')
