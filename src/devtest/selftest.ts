/**
 * Kit de auto-teste do Hermes (em produção, no Linux).
 * NÃO apagar esta pasta — é o laboratório de validação do dono.
 *
 * runSelfTestMod: testa o sarcasmo (handleKeywords) de 3 formas:
 *   1. palavra "bot" solta (msg de outro user)
 *   2. menção ao bot via @lid (caso real: usuario marca @WarriorBlack)
 *   3. fluxo real: bot (Hermes) digita "bot" no grupo -> message_create captura
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
    log('=== SELFTEST sarcasmo: "bot" solto + menção @lid + fluxo real ===');
    const kw = (adapter as any).selfTestHandleKeywords;
    const sent: string[] = [];
    const fakeReply = async (text: string) => { sent.push(text); await adapter.sendMessage(alvoTeste, '🤖 [SELFTEST sarc] ' + text); return true; };

    // 1. palavra "bot" solta (msg de outro user)
    let intercepted = await kw({
      body: 'bot', mentionedIds: [], hasQuotedMsg: false, quotedMsg: undefined,
      author: alvoTeste, from: alvoTeste, id: { _serialized: 'fake_bot_1' }, reply: fakeReply, delete: async () => true,
    } as any, (adapter as any).innerClient);
    log(`1) "bot" solto -> intercepted=${intercepted} resposta="${sent[sent.length-1] || ''}"`);

    // 2. menção ao bot via @lid (caso real: usuario marca @WarriorBlack -> mentionedIds tem 2592935567439@lid)
    sent.length = 0;
    intercepted = await kw({
      body: 'olha @bot', mentionedIds: ['2592935567439@lid'], hasQuotedMsg: false, quotedMsg: undefined,
      author: alvoTeste, from: alvoTeste, id: { _serialized: 'fake_mencao_1' }, reply: fakeReply, delete: async () => true,
    } as any, (adapter as any).innerClient);
    log(`2) menção @lid do bot -> intercepted=${intercepted} resposta="${sent[sent.length-1] || ''}"`);

    // 3. fluxo real: bot (Hermes) digita "bot" no grupo -> message_create captura e dá reply
    await adapter.sendMessage(alvoTeste, 'bot');
    log('3) "bot" enviado pelo bot (message_create). handleKeywords deve dar reply com a frase.');
  } catch (e: any) {
    log(`FALHA no self-test sarcasmo: ${e?.message}`);
  }
}
