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
  'ping',
];

export async function runSelfTestOndeEstou(_adapter: SelfTestAdapter, _alvoTeste: string): Promise<void> {
  log('=== SELFTEST $ondeestou desligado (validado pelo dono) ===');
}

export async function runSelfTestMod(adapter: SelfTestAdapter, alvoTeste: string): Promise<void> {
  if ((global as any).__selftestModRan) return;
  (global as any).__selftestModRan = true;

  // LISTA: manda cada comando no grupo teste (como se humano tivesse digitado)
  // para validar que o ctx.reply responde (corrigido prefixo wpp:).
  for (const cmd of LISTA) {
    try {
      log(`[LISTA] mandando $${cmd} no grupo teste`);
      await adapter.sendMessage(alvoTeste, `$${cmd}`);
      await new Promise((r) => setTimeout(r, 1500));
    } catch (e: any) {
      log(`[LISTA] erro ao mandar $${cmd}: ${e?.message}`);
    }
  }

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

  // FASE 4: ativar/abrir o chat internamente e re-examinar (sem remover, sem revogar)
  const fig = '120363419033272638@g.us';
  const MI = '895627065085';
  try {
    const client = (adapter as any).innerClient;
    // 1) obter + ativar o chat via WWebJS (forca materializacao no runtime)
    const chat = await client.getChatById(fig);
    const activateSteps: string[] = [];
    try { if (typeof chat.activate === 'function') { await chat.activate(); activateSteps.push('activate'); } } catch (e: any) { activateSteps.push('activate-err:' + e.message); }
    try { if (typeof chat.open === 'function') { await chat.open(); activateSteps.push('open'); } } catch (e: any) { activateSteps.push('open-err:' + e.message); }
    try { if (typeof chat.markRead === 'function') { await chat.markRead(); activateSteps.push('markRead'); } } catch (e: any) { activateSteps.push('markRead-err:' + e.message); }
    try { await chat.fetchMessages({ limit: 60 }); activateSteps.push('fetchMessages'); } catch (e: any) { activateSteps.push('fetch-err:' + e.message); }
    log(`[ck7-fase4] activate steps: ${activateSteps.join(',')}`);
    // 2) inspecionar Store apos ativar
    const page = client.pupPage || (client as any).pupBrowser;
    if (!page || !page.evaluate) { log('[ck7-fase4] sem pupPage'); }
    else {
      const diag = await page.evaluate(async (chatId: string, mi: string) => {
        const W: any = (window as any);
        const out: any = { steps: [] };
        const safeStr = (x: any) => (x === null || x === undefined ? '' : String(x));
        const extractModels = (r: any): any[] => {
          if (!r) return [];
          if (Array.isArray(r)) return r;
          if (r.models) return r.models;
          if (r._models) return r._models;
          if (typeof r.getModelsArray === 'function') return r.getModelsArray();
          if (r._modelsArray) return r._modelsArray;
          return [];
        };
        // verificar como Store.Chats esta exposto nesta instancia
        out.storeChatsType = typeof W.Store?.Chats;
        out.storeChatsGet = typeof W.Store?.Chats?.get;
        out.storeChatsKeys = W.Store?.Chats && typeof W.Store.Chats === 'object' ? Object.keys(W.Store.Chats).slice(0, 30) : 'n/a';
        const coll: any = (typeof W.require === 'function') ? W.require('WAWebCollections') : null;
        out.collMsgByChat = typeof coll?.Msg?.byChat;
        const match = (m: any): boolean => {
          const hay = [safeStr(m.author), safeStr(m.from), safeStr(m?.id?.participant), safeStr(m?.id?._serialized), safeStr(m.body)].join('|').toLowerCase();
          return hay.includes(mi) || hay.includes('8956270') || hay.includes('conversar com');
        };
        // tentar achar o chat por varios caminhos
        let chatObj: any = null;
        try { if (typeof W.Store?.Chats?.get === 'function') chatObj = W.Store.Chats.get(chatId); } catch (e: any) { out.getErr = e.message; }
        if (!chatObj && coll?.Msg?.byChat) {
          // Msg.byChat pode devolver models que referenciam o chat; inspecionar os 2
          const arr = extractModels(coll.Msg.byChat(chatId));
          out.msgByChat = arr.length;
          out.msgByChatFound = arr.filter(match).map((m: any) => ({ type: m.type, id: safeStr(m?.id?._serialized), author: safeStr(m.author) }));
        }
        if (chatObj) {
          const msgs = extractModels(chatObj.msgs);
          out.chatMsgs = msgs.length;
          out.chatMsgsFound = msgs.filter(match).map((m: any) => ({ type: m.type, id: safeStr(m?.id?._serialized), author: safeStr(m.author) }));
        }
        out.conclusao = (out.chatMsgsFound?.length || out.msgByChatFound?.length)
          ? 'CARD ENCONTRADO apos ativar - ver found_*'
          : 'ainda nao encontrado apos ativar chat';
        return out;
      }, fig, MI);
      log('[ck7-fase4] ' + JSON.stringify(diag).slice(0, 2500));
    }
  } catch (e: any) {
    log(`[ck7-fase4] ERRO geral: ${e?.message}`);
  }
  log('=== SELFTEST concluído. Leia o log das respostas. ===');
}
