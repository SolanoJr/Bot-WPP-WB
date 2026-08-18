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

  // INVESTIGAÇÃO SILENCIOSA: lista msgs recentes do Figurinhas p/ achar o card do bot
  // estrangeiro e tentar apagar via revoke (formato correto p/ msg de OUTRO).
  const fig = '120363419033272638@g.us';
  try {
    const client = (adapter as any).innerClient;
    const chat = await client.getChatById(fig);
    const msgs = await chat.fetchMessages({ limit: 30 });
    log(`[ck7-limp] ${msgs.length} msgs recentes. Procurando card estrangeiro...`);
    let alvo: any = null;
    for (const m of msgs) {
      const a = (m.author || m.from || '').replace('@c.us', '').replace('@lid', '');
      const txt = JSON.stringify(m._data || {}).slice(0, 300);
      if (a.endsWith('895627065085') || a === '28347522375907' || /Conversar com \+62|MI065085|8956270/i.test(txt) || /8956270/i.test(a)) {
        alvo = m;
        log(`[ck7-limp] ACHOU autor=${a} type=${m.type}`);
        break;
      }
    }
    if (!alvo) {
      // lista autores p/ debug
      log('[ck7-limp] nao achou. autores recentes: ' + msgs.map(m => (m.author||m.from||'?').replace('@c.us','').replace('@lid','')).filter(Boolean).slice(0,15).join(','));
    } else {
      // tenta revoke (formato p/ msg de OUTRO usuario)
      try {
        const r = await client.sendMessage(fig, { delete: { id: alvo.id._serialized, fromMe: false } } as any);
        log(`[ck7-limp] revoke retornou: ${JSON.stringify(r)}`);
      } catch (e1: any) {
        log(`[ck7-limp] revoke ERRO: ${e1?.message}`);
        try {
          const r2 = await alvo.delete(true);
          log(`[ck7-limp] delete(true) retornou: ${JSON.stringify(r2)}`);
        } catch (e2: any) {
          log(`[ck7-limp] delete(true) ERRO: ${e2?.message}`);
        }
      }
    }
  } catch (e: any) {
    log(`[ck7-limp] ERRO geral: ${e?.message}`);
  }
  log('=== SELFTEST concluído. Leia o log das respostas. ===');
}
