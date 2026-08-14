/**
 * Kit de auto-teste do Hermes (em produção, no Linux).
 * NÃO apagar esta pasta — é o laboratório de validação do dono.
 *
 * runSelfTestMod: único teste do sarcasmo = mandar "bot" no grupo.
 * O bot (Hermes) digita "bot"; o handleKeywords (no message_create) captura
 * a palavra e dá reply na própria mensagem com a frase do dono.
 */

export interface SelfTestAdapter {
  sendMessage(chatId: string, text: string, options?: any): Promise<any>;
  getLastChat?(...args: any[]): Promise<any>;
  selfTestHandleKeywords?(msg: any): Promise<boolean>;
}

function log(msg: string): void {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.log(`[SELFTEST ${ts}] ${msg}`);
}

export async function runSelfTestOndeEstou(_adapter: SelfTestAdapter, _alvoTeste: string): Promise<void> {
  // $ondeestou já validado pelo dono — não auto-testa mais.
  log('=== SELFTEST $ondeestou desligado (validado pelo dono) ===');
}

export async function runSelfTestMod(adapter: SelfTestAdapter, alvoTeste: string): Promise<void> {
  if ((global as any).__selftestModRan) return; // não rodar 2x se PM2 fizer double restart
  (global as any).__selftestModRan = true;
  try {
    log('=== SELFTEST sarcasmo: Hermes digita "bot" no grupo ===');
    // O bot manda "bot". O WWebJS emite message_create -> handleKeywords captura e dá reply.
    await adapter.sendMessage(alvoTeste, 'bot');
    log('=== "bot" enviado pelo bot. O handleKeywords (message_create) deve dar reply com a frase. ===');
  } catch (e: any) {
    log(`FALHA no self-test sarcasmo: ${e?.message}`);
  }
}
