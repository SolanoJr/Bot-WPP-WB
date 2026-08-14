/**
 * Kit de auto-teste do Hermes (em produção, no Linux).
 * NÃO apagar esta pasta — é o laboratório de validação do dono.
 *
 * runSelfTestMod: exercita o sarcasmo (handleKeywords) de 3 formas:
 *   1. handleKeywords direto com body "bot" (msg de outro user)
 *   2. handleKeywords direto com reply numa msg do bot (quotedMsg.fromMe=true)
 *   3. sendMessage("bot") no grupo -> dispara o handler real (DIAG keyword no log)
 */

export interface SelfTestAdapter {
  sendMessage(chatId: string, text: string, options?: any): Promise<any>;
  getLastChat?(...args: any[]): Promise<any>;
  selfTestHandleKeywords?(msg: any): Promise<boolean>;
}

import { handleKeywords } from '../../services/keywordHandler';

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
    log('=== SELFTEST sarcasmo (handleKeywords + handler real) ===');
    const kw = (adapter as any).selfTestHandleKeywords || handleKeywords;
    const sent: string[] = [];
    const fakeReply = async (text: string) => { sent.push(text); await adapter.sendMessage(alvoTeste, '🤖 [SELFTEST sarc] ' + text); return true; };

    // 1. palavra "bot" em msg de outro user
    let intercepted = await kw({
      body: 'bot', mentionedIds: [], hasQuotedMsg: false, quotedMsg: undefined,
      author: alvoTeste, from: alvoTeste, id: { _serialized: 'fake_bot_1' }, reply: fakeReply, delete: async () => true,
    } as any, (adapter as any).innerClient);
    log(`1) "bot" -> intercepted=${intercepted} resposta="${sent[sent.length-1] || ''}"`);

    // 2. reply numa msg do bot (quotedMsg.fromMe=true), qualquer texto
    sent.length = 0;
    const replyMsg: any = {
      body: 'e aí', mentionedIds: [], hasQuotedMsg: true,
      quotedMsg: { fromMe: true, author: '558581344211@c.us' },
      author: alvoTeste, from: alvoTeste, id: { _serialized: 'fake_reply_1' }, reply: fakeReply, delete: async () => true,
    };
    log(`2) msg tem hasQuotedMsg=${replyMsg.hasQuotedMsg} quotedFromMe=${replyMsg.quotedMsg?.fromMe} quotedAuthor=${replyMsg.quotedMsg?.author}`);
    intercepted = await kw(replyMsg, (adapter as any).innerClient);
    log(`2) reply no bot -> intercepted=${intercepted} resposta="${sent[sent.length-1] || ''}"`);

    // 3. dispara o handler REAL: manda "bot" no grupo (bot recebe como message de outro? não, mas o handler real roda p/ msgs reais)
    await adapter.sendMessage(alvoTeste, 'bot');
    log('3) sendMessage("bot") no grupo enviado — veja [DIAG keyword] no log estável');

    log('=== SELFTEST sarcasmo concluído. Veja o log (DIAG keyword + respostas no grupo). ===');
  } catch (e: any) {
    log(`FALHA no self-test sarcasmo: ${e?.message}`);
  }
}
