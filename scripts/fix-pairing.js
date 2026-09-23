import re

with open('/home/solanojr/bot-wpp/src/platforms/whatsapp/baileys/BaileysConnection.ts', 'r') as f:
    content = f.read()

# Find the old pairing code block (immediate request) and replace with event-based
old_pattern = r"""    // ═══════════════════════════════════════════════════════════════
    // PAIRING CODE — autenticação via código de 8 caracteres
    // Só solicita se não há credenciais registradas\.
    // Format: XXXX-YYYY \(8 chars alfanuméricos\)
    // ═══════════════════════════════════════════════════════════════
    const hasCreds = !!\(driverState\?\.creds\?\.me\?\.id \|\| driverState\?\.creds\?\.registered\);
    if \(!hasCreds\) \{
      const phoneNumber = this\.getPhoneNumber\(\);
      logInfo\(''\);
      logInfo\('═╗════════════════════════════════════════════════════════════╗'\);
      logInfo\('║  🔗 WARRIORBLACK — PAIRING CODE                           ║'\);
      logInfo\('╠════════════════════════════════════════════════════════════╣'\);
      logInfo\(`║  Número: \$\{phoneNumber\}                                    `\);
      logInfo\('║  Solicitando código de 8 dígitos\.\.\.                       ║'\);
      logInfo\('╚════════════════════════════════════════════════════════════╝'\);
      logInfo\(''\);
      try \{
        const code = await driver\.requestPairingCode\(phoneNumber\);"""

new_code = """    // ═══════════════════════════════════════════════════════════════
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
            const code = await driver.requestPairingCode(phoneNumber);"""

if re.search(old_pattern, content):
    content = re.sub(old_pattern, new_code, content)
    with open('/home/solanojr/bot-wpp/src/platforms/whatsapp/baileys/BaileysConnection.ts', 'w') as f:
        f.write(content)
    print('REPLACED SUCCESSFULLY')
else:
    print('PATTERN NOT FOUND')
    # Debug: print lines around the pairing code section
    lines = content.split('\n')
    for i, line in enumerate(lines[295:340], start=296):
        print(f'{i}: {repr(line)}')
