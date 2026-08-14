/**
 * Kit de auto-teste do Hermes (em produção, no Linux).
 * NÃO apagar esta pasta — é o laboratório de validação do dono.
 *
 * IMPORTANTE: os testes NÃO devem encher o grupo com mensagens.
 * O selftest de sarcasmo roda em memória (fakeReply local) e NÃO manda nada no grupo.
 * O teste de $noticias manda 1x só (comando real) e lê a resposta no log.
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

  // Sarcasmo: valida EM MEMÓRIA (fakeReply local, não manda no grupo).
  // Se quiser testar no grupo, descomente o bloco [GRUPO] abaixo.
  const kw = (adapter as any).selfTestHandleKeywords;
  const sent: string[] = [];
  const fakeReply = async (text: string) => { sent.push(text); return true; }; // local, sem sendMessage

  try {
    let intercepted = await kw({
      body: 'bot', mentionedIds: [], hasQuotedMsg: false, quotedMsg: undefined,
      author: alvoTeste, from: alvoTeste, id: { _serialized: 'fake_bot_1' }, reply: fakeReply, delete: async () => true,
    } as any, (adapter as any).innerClient);
    log(`[sarc] 1) "bot" solto -> intercepted=${intercepted}`);

    sent.length = 0;
    intercepted = await kw({
      body: 'olha @bot', mentionedIds: ['2592935567439@lid'], hasQuotedMsg: false, quotedMsg: undefined,
      author: alvoTeste, from: alvoTeste, id: { _serialized: 'fake_mencao_1' }, reply: fakeReply, delete: async () => true,
    } as any, (adapter as any).innerClient);
    log(`[sarc] 2) menção @lid -> intercepted=${intercepted}`);

    sent.length = 0;
    intercepted = await kw({
      body: 'sai dai doido', mentionedIds: [], hasQuotedMsg: true, quotedMsg: undefined,
      getQuotedMessage: async () => ({ fromMe: true, author: '558581344211@c.us', participant: '558581344211@c.us' }),
      author: alvoTeste, from: alvoTeste, id: { _serialized: 'fake_reply_2' }, reply: fakeReply, delete: async () => true,
    } as any, (adapter as any).innerClient);
    log(`[sarc] 3) reply em msg do bot -> intercepted=${intercepted}`);

    log('[sarc] validado em memória (sem mensagens no grupo). Use o teste de comando real abaixo se quiser grupo.');
  } catch (e: any) {
    log(`[sarc] FALHA: ${e?.message}`);
  }

  // Teste de COMANDO REAL (1x só, isolado): $noticias
  try {
    log('[cmd] mandando $noticias 1x (comando real)...');
    await adapter.sendMessage(alvoTeste, '$noticias');
    log('[cmd] $noticias enviado. Veja a resposta TOP NOTÍCIAS no log.');
  } catch (e: any) {
    log(`[cmd] FALHA $noticias: ${e?.message}`);
  }
}
