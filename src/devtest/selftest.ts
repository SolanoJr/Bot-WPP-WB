/**
 * Kit de auto-teste do Hermes (em produção, no Linux).
 * NÃO apagar esta pasta — é o laboratório de validação do dono.
 *
 * O selftest roda no `ready` do WhatsAppAdapter (1x por boot).
 * Manda a LISTA de comandos (1x cada, espaçado) no grupo teste e loga o resultado.
 * O bot processa cada comando normalmente — exatamente como se um humano tivesse digitado.
 * Só 1 restart por sessão de testes (não 1 por comando).
 *
 * Para testar um comando específico, edite a LISTA abaixo.
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

// Lista de comandos a testar (1 por vez, isolado). Edite conforme a sequência.
// OBS: deixar vazio = NÃO dispara selftest (evita o bot encher o grupo sozinho).
// Comandos de moderação ($mute etc) são testados MANUALMENTE no grupo.
const LISTA: string[] = [
  'mute',
];

export async function runSelfTestOndeEstou(_adapter: SelfTestAdapter, _alvoTeste: string): Promise<void> {
  log('=== SELFTEST $ondeestou desligado (validado pelo dono) ===');
}

export async function runSelfTestMod(adapter: SelfTestAdapter, alvoTeste: string): Promise<void> {
  if ((global as any).__selftestModRan) return;
  (global as any).__selftestModRan = true;

  // Sarcasmo: valida EM MEMÓRIA (fakeReply local, não manda no grupo).
  const kw = (adapter as any).selfTestHandleKeywords;
  const sent: string[] = [];
  const fakeReply = async (text: string) => { sent.push(text); return true; };
  try {
    let intercepted = await kw({
      body: 'bot', mentionedIds: [], hasQuotedMsg: false, quotedMsg: undefined,
      author: alvoTeste, from: alvoTeste, id: { _serialized: 'fake_bot_1' }, reply: fakeReply, delete: async () => true,
    } as any, (adapter as any).innerClient);
    log(`[sarc] 1) "bot" solto -> ${intercepted}`);
    sent.length = 0;
    intercepted = await kw({
      body: 'olha @bot', mentionedIds: ['2592935567439@lid'], hasQuotedMsg: false, quotedMsg: undefined,
      author: alvoTeste, from: alvoTeste, id: { _serialized: 'fake_mencao_1' }, reply: fakeReply, delete: async () => true,
    } as any, (adapter as any).innerClient);
    log(`[sarc] 2) menção @lid -> ${intercepted}`);
    sent.length = 0;
    intercepted = await kw({
      body: 'sai dai doido', mentionedIds: [], hasQuotedMsg: true, quotedMsg: undefined,
      getQuotedMessage: async () => ({ fromMe: true, author: '558581344211@c.us', participant: '558581344211@c.us' }),
      author: alvoTeste, from: alvoTeste, id: { _serialized: 'fake_reply_2' }, reply: fakeReply, delete: async () => true,
    } as any, (adapter as any).innerClient);
    log(`[sarc] 3) reply em msg do bot -> ${intercepted}`);
  } catch (e: any) {
    log(`[sarc] FALHA: ${e?.message}`);
  }

  // TESTE AUTOMOD: liga toggles e manda link/spam (bot é admin, AutoMod vai pular, mas prova pipeline)
  try {
    await adapter.sendMessage(alvoTeste, '$autolink on');
    await new Promise(r => setTimeout(r, 1000));
    await adapter.sendMessage(alvoTeste, '$antispam on');
    await new Promise(r => setTimeout(r, 1000));
    await adapter.sendMessage(alvoTeste, '$detectar on');
    await new Promise(r => setTimeout(r, 1000));
    await adapter.sendMessage(alvoTeste, 'Veja esse link suspeito https://exemplo.bet/xyz');
    await new Promise(r => setTimeout(r, 1500));
    await adapter.sendMessage(alvoTeste, 'ganhe bônus dinheiro fácil agora');
    await new Promise(r => setTimeout(r, 1500));
    log(`[automod-test] ligou toggles + mandou link/spam`);
  } catch (e: any) {
    log(`[automod-test] ERRO: ${e?.message}`);
  }
  log('=== SELFTEST concluído. Leia o log das respostas. ===');
}
