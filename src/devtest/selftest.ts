/**
 * selftest.ts — Testes autônomos em PRODUÇÃO feitos pelo PRÓPRIO BOT.
 *
 * Objetivo: o Hermes (operando como o bot 558581344211@c.us, logado no Linux)
 * se auto-testa mandando comandos reais em chats visíveis (grupo teste), para
 * validar sem encher o grupo com comandos já aprovados.
 *
 * REGRA (anotada depois de várias lutas):
 *  - NUNCA apagar o teste após funcionar. Este arquivo é o "kit" do Hermes.
 *  - Só testar 1 comando por vez (foco do dono). Kick/ban JÁ foram validados
 *    (remoção + nome via menção/getTargetDisplayName + groupTag) — não repetir.
 *  - O comando $ondeestou usa ctx.chatId (não msg.from) — corrigido em 14/08.
 *
 * Este arquivo NUNCA deve ser apagado após o teste funcionar. Para desligar,
 * basta não definir WPP_TEST_GROUP_ID (o adapter só chama se alvoTeste existir).
 */

import * as fs from 'fs';
import * as path from 'path';

const LOG_PATH = path.join(__dirname, '..', '..', 'src', 'devtest', 'selftest.log');

function log(line: string) {
  const ts = new Date().toISOString();
  const entry = `[${ts}] ${line}`;
  console.log('[SELFTEST]', line);
  try {
    fs.appendFileSync(LOG_PATH, entry + '\n');
  } catch {
    /* ignore */
  }
}

export interface SelfTestAdapter {
  sendMessage(chatId: string, text: string, options?: any): Promise<any>;
  innerClient: any;
}

/**
 * Teste do $ondeestou no GRUPO TESTE (canto visível para o dono).
 * @param adapter adapter do WhatsApp
 * @param alvoTeste JID do grupo teste (ex: 120363410094452673@g.us)
 */
export async function runSelfTestOndeEstou(adapter: SelfTestAdapter, alvoTeste: string): Promise<void> {
  try {
    log('=== SELFTEST $ondeestou (grupo teste, visível) ===');
    await adapter.sendMessage(alvoTeste, '$ondeestou');
    log('$ondeestou enviado no grupo teste');
    log('=== SELFTEST $ondeestou agendado. Verifique o log estável (procure "Solicitação de Localização"). ===');
  } catch (e: any) {
    log(`FALHA no self-test $ondeestou: ${e?.message}`);
  }
}

/**
 * Teste dos comandos de moderação ($automod e $banidos) no GRUPO TESTE.
 * @param adapter adapter do WhatsApp
 * @param alvoTeste JID do grupo teste (ex: 120363410094452673@g.us)
 */
export async function runSelfTestMod(adapter: SelfTestAdapter, alvoTeste: string): Promise<void> {
  if ((global as any).__selftestModRan) return; // não rodar 2x se PM2 fizer double restart
  (global as any).__selftestModRan = true;
  try {
    log('=== SELFTEST sarcasmo (chama handleKeywords com msg "bot") ===');
    // Simula uma mensagem de outro usuário com a palavra "bot" para exercitar o gatilho.
    const { handleKeywords } = await import('../../services/keywordHandler');
    const fakeMsg: any = {
      body: 'bot',
      mentionedIds: [],
      hasQuotedMsg: false,
      quotedMsg: undefined,
      author: alvoTeste,
      from: alvoTeste,
      id: { _serialized: 'fake_selftest_bot_1' },
      reply: async (text: string, opts?: any) => {
        await adapter.sendMessage(alvoTeste, '🤖 [SELFTEST sarcasmo] ' + text, opts);
        return true;
      },
      delete: async () => true,
    };
    const intercepted = await handleKeywords(fakeMsg, (adapter as any).innerClient);
    log(`handleKeywords retornou intercepted=${intercepted}`);
    log('=== SELFTEST sarcasmo agendado. Verifique o log (procure "Palavra-chave detectada"). ===');
  } catch (e: any) {
    log(`FALHA no self-test sarcasmo: ${e?.message}`);
  }
}
