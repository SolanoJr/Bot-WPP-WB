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
const LISTA = [
  'lembrete',
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

  // Lista de comandos: manda 1x cada, espaçado 3s.
  for (const cmd of LISTA) {
    try {
      log(`[cmd] mandando $${cmd} ...`);
      await adapter.sendMessage(alvoTeste, '$' + cmd);
      await new Promise(r => setTimeout(r, 3000));
      log(`[cmd] $${cmd} enviado. Veja resposta no log.`);
    } catch (e: any) {
      log(`[cmd] FALHA $${cmd}: ${e?.message}`);
    }
  }
  log('=== SELFTEST concluído. Leia o log das respostas. ===');
}
