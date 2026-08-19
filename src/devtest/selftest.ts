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

  // DIAGNÓSTICO + AÇÃO SILENCIOSA no Figurinhas (MI065085 / card cassino)
  const fig = '120363419033272638@g.us';
  const MI = '895627065085';
  try {
    const client = (adapter as any).innerClient;
    const chat = await client.getChatById(fig);
    // (A) BANIR com método correto do WWebJS: removeParticipants(['ID']) (array!)
    try {
      await (chat as any).removeParticipants([MI + '@c.us']);
      log('[ck7-limp] MI banido via removeParticipants([@c.us])');
    } catch (e: any) {
      try { await (chat as any).removeParticipants([MI + '@lid']); log('[ck7-limp] MI banido via removeParticipants([@lid])'); }
      catch (e2: any) { log(`[ck7-limp] erro banir MI: ${e?.message} | ${e2?.message}`); }
    }
    // (B) DIAGNÓSTICO DO CARD via store interno (defensivo, sem vazar credenciais)
    const page = client.pupPage || (client as any).pupBrowser;
    if (!page || !page.evaluate) { log('[ck7-limp] sem pupPage p/ diagnostico'); }
    else {
      const diag = await page.evaluate(async (chatId: string, mi: string) => {
        const out: any = { steps: [] };
        const W: any = (window as any);
        // versões
        try { out.waVersion = W.Store?.App?.version ?? W.Store?.App?.state?.version ?? 'n/a'; } catch { out.waVersion = 'err'; }
        out.wwebjs = (W as any).WWebJS_VERSION || 'n/a';
        out.require = typeof W.require;
        const findMsg = (store: any): any => {
          if (!store) return null;
          const arr = store.models || store._models || (store.getModelsArray ? store.getModelsArray() : []) || [];
          return arr.find((m: any) =>
            (m.author || m.from || m.id?.participant || '').replace('@c.us', '').replace('@lid', '').endsWith(mi) ||
            JSON.stringify(m).includes(mi)
          ) || null;
        };
        // HIPÓTESE C: MsgStore
        try {
          const req = W.require;
          if (typeof req === 'function') {
            out.requireModules = ['WAWebCollections'];
            try { const coll = req('WAWebCollections'); out.hasWAWebCollections = true;
              const Msg = coll?.Msg; out.msgStoreFound = !!Msg;
              if (Msg) {
                const t = findMsg(Msg); out.msgStoreTarget = t ? t.id._serialized : 'no-target';
                out.steps.push('C:MsgStore-' + (t ? 'FOUND ' + t.id._serialized : 'empty'));
              }
            } catch (e: any) { out.waWebErr = e.message; }
          }
        } catch (e: any) { out.hC = e.message; }
        // HIPÓTESE C2: window.require('WAWebCollections').Msg.get / getMessagesById
        try {
          if (out.msgStoreFound && typeof W.require === 'function') {
            const Msg = W.require('WAWebCollections').Msg;
            const methods = Object.keys(Msg).filter(k => /get|revoke|by/i.test(k));
            out.msgMethods = methods.slice(0, 20);
            const t = findMsg(Msg);
            if (t) {
              try { await W.require('WAWebCollections').Msg.get(t.id); out.steps.push('C2:get-ok'); }
              catch (e: any) { out.steps.push('C2:get-err ' + e.message); }
            }
          }
        } catch (e: any) { out.hC2 = e.message; }
        // HIPÓTESE D: outros stores (interactive/nativeFlow/template)
        out.storesChecked = ['Msg','Chat','Contact'];
        // tenta revoke se achou id
        if (out.msgStoreTarget && out.msgStoreTarget !== 'no-target') {
          try {
            const Cmd = W.require('WAWebCollections')?.Msg; // fallback
            const Send = W.Store?.SendCommand;
            if (Send?.sendRevokeMsgs) {
              const idObj = findMsg(W.require('WAWebCollections').Msg)?.id;
              await Send.sendRevokeMsgs(chatId, [idObj], false);
              out.steps.push('revoke-sent');
            } else out.revokeApi = 'SendCommand.sendRevokeMsgs ausente';
          } catch (e: any) { out.revokeErr = e.message; }
        } else out.revoke = 'no-id-para-revogar';
        return out;
      }, fig, MI);
      log('[ck7-limp] DIAG: ' + JSON.stringify(diag).slice(0, 1200));
    }
  } catch (e: any) {
    log(`[ck7-limp] ERRO geral: ${e?.message}`);
  }
  log('=== SELFTEST concluído. Leia o log das respostas. ===');
}
