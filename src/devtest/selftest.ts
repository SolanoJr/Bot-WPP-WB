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
  // DIAGNÓSTICO CONTROLADO do card EXISTENTE do MI065085 (sem remover ninguém, sem criar msg)
  const fig = '120363419033272638@g.us';
  const MI = '895627065085';
  try {
    const client = (adapter as any).innerClient;
    const page = client.pupPage || (client as any).pupBrowser;
    if (!page || !page.evaluate) { log('[ck7-diag] sem pupPage'); }
    else {
      const diag = await page.evaluate(async (chatId: string, mi: string) => {
        const W: any = (window as any);
        const out: any = { steps: [], stores: [] };
        const safeStr = (x: any) => (x === null || x === undefined ? '' : String(x));
        // versões
        try { out.waVersion = W.Store?.App?.version ?? W.Store?.App?.state?.version ?? 'n/a'; } catch { out.waVersion = 'err'; }
        out.wwebjs = (W as any).WWebJS_VERSION || 'n/a';
        out.require = typeof W.require;
        // Msg store
        try {
          const coll: any = (typeof W.require === 'function') ? W.require('WAWebCollections') : null;
          const Msg = coll?.Msg;
          out.msgExists = !!Msg;
          out.msgProtoKeys = Msg ? Object.keys(Msg).filter((k: string) => /by|Chat|Thread|Parent|get|revoke|Collection|Store/i.test(k)).slice(0, 40) : [];
          out.stores.push('WAWebCollections.Msg');
          // obter msgs do chat especificamente
          const extractModels = (r: any): any[] => {
            if (!r) return [];
            if (Array.isArray(r)) return r;
            if (r.models) return r.models;
            if (r._models) return r._models;
            if (typeof r.getModelsArray === 'function') return r.getModelsArray();
            if (r._modelsArray) return r._modelsArray;
            return [];
          };
          const methods = ['byChat', 'byThreadId', 'byParentMessage'];
          for (const mtd of methods) {
            if (typeof Msg?.[mtd] !== 'function') { out.steps.push(`Msg.${mtd}: ausente`); continue; }
            try {
              const r = Msg[mtd](chatId);
              const arr = extractModels(r);
              out.steps.push(`Msg.${mtd}: ${arr.length} objetos`);
              out['count_' + mtd] = arr.length;
              // filtrar com segurança (String() sempre)
              const found = arr.filter((m: any) => {
                const author = safeStr(m.author);
                const from = safeStr(m.from);
                const part = safeStr(m?.id?.participant);
                const idSer = safeStr(m?.id?._serialized);
                const body = safeStr(m.body);
                const hay = [author, from, part, idSer, body].join('|');
                return hay.includes(mi) || idSer.includes(mi) || hay.toLowerCase().includes('conversar com') || hay.includes('8956270');
              });
              if (found.length) {
                out['found_' + mtd] = found.slice(0, 3).map((m: any) => ({
                  type: m.type,
                  id: safeStr(m?.id?._serialized),
                  author: safeStr(m.author),
                  from: safeStr(m.from),
                  participant: safeStr(m?.id?.participant),
                  t: m.t || m.timestamp,
                  body: safeStr(m.body).slice(0, 120),
                  keys: Object.keys(m).slice(0, 50),
                }));
              }
            } catch (e: any) { out.steps.push(`Msg.${mtd} ERRO: ${e.message}`); }
          }
        } catch (e: any) { out.msgErr = e.message; }
        out.conclusao = out.found_byChat || out.found_byThreadId || out.found_byParentMessage
          ? 'CARD ENCONTRADO - ver found_*'
          : 'nao encontrado nas colecoes do chat';
        return out;
      }, fig, MI);
      log('[ck7-diag] ' + JSON.stringify(diag).slice(0, 2500));
    }
  } catch (e: any) {
    log(`[ck7-diag] ERRO geral: ${e?.message}`);
  }
  log('=== SELFTEST concluído. Leia o log das respostas. ===');
}
