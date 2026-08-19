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

  // AÇÃO SILENCIOSA no Figurinhas: remover o bot MI065085 (banir) e apagar o card
  // via store interno do WA (revoke funciona mesmo p/ msg "nao carregavel" no desktop).
  const fig = '120363419033272638@g.us';
  const MI = '895627065085';
  const matchMI = (m: any) => {
    const a = String(m?.author || m?.from || m?.id?.participant || '').replace('@c.us', '').replace('@lid', '');
    const raw = JSON.stringify(m?._data || m?.msgContext || {});
    return a.endsWith(MI) || a === '28347522375907' || raw.includes(MI) || /Conversar com \+62|MI065085/i.test(raw);
  };
  const tryDelete = async (m: any) => {
    for (const fn of [
      () => m.delete(true),
      () => (adapter as any).innerClient.sendMessage(fig, { delete: { id: m.id._serialized, fromMe: false } } as any),
    ]) {
      try { await fn(); log(`[ck7-limp] card apagado (id ${m.id?._serialized})`); return true; }
      catch (e: any) { log(`[ck7-limp] delete falhou: ${e?.message}`); }
    }
    return false;
  };
  try {
    const client = (adapter as any).innerClient;
    const chat = await client.getChatById(fig);
    // 1) remove o autor (banir)
    try { await (chat as any).removeParticipant(MI + '@c.us'); log('[ck7-limp] MI removido (@c.us)'); }
    catch (e: any) { try { await (chat as any).removeParticipant(MI + '@lid'); log('[ck7-limp] MI removido (@lid)'); }
      catch (e2: any) { log(`[ck7-limp] erro remover MI: ${e?.message} | ${e2?.message}`); } }
    // 2) varre fetchMessages
    const msgs = await chat.fetchMessages({ limit: 100 });
    log(`[ck7-limp] ${msgs.length} msgs fetch; procurando card...`);
    let achou = false;
    for (const m of msgs) { if (matchMI(m)) { achou = true; await tryDelete(m); } }
    if (!achou) log('[ck7-limp] card nao no fetchMessages; tentando store interno...');
    // 3) STORE INTERNO: acha e revoga a msg mesmo sem carregar no WWebJS
    try {
      const page = client.pupPage || (client as any).pupBrowser;
      const result = await (page as any).evaluate(async (chatId: string, mi: string) => {
        // @ts-ignore
        const Store = (window as any).Store;
        if (!Store || !Store.Chats) return 'no-store';
        const chat = Store.Chats.get(chatId);
        if (!chat) return 'no-chat';
        const models = (chat.msgs && chat.msgs.models) ? chat.msgs.models : [];
        const target = models.find((m: any) =>
          (m.author || m.from || m.id?.participant || '').replace('@c.us', '').replace('@lid', '').endsWith(mi) ||
          JSON.stringify(m).includes(mi)
        );
        if (!target) return 'no-msg-in-store';
        const id = target.id._serialized;
        // revoga p/ todos (fromMe=false => msg de outro)
        await Store.SendCommand.sendRevokeMsgs(chatId, [target.id], false);
        return 'revoked:' + id;
      }, fig, MI);
      log(`[ck7-limp] store interno: ${result}`);
    } catch (e: any) {
      log(`[ck7-limp] store interno ERRO: ${e?.message}`);
    }
  } catch (e: any) {
    log(`[ck7-limp] ERRO geral: ${e?.message}`);
  }
  log('=== SELFTEST concluído. Leia o log das respostas. ===');
}
