/**
 * Auto-teste comportamental opcional do bot.
 *
 * Só executa quando WPP_AUTOSELFTEST=1 e WPP_TEST_GROUP_ID está definido.
 * O modo padrão testa respostas e não executa ações destrutivas.
 */

export interface SelfTestAdapter {
  sendMessage(chatId: string, text: string, options?: any): Promise<any>;
  selfTestHandleKeywords?(msg: any): Promise<boolean>;
}

function log(message: string): void {
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.log(`[SELFTEST ${timestamp}] ${message}`);
}

const COMMANDS = ['ping', 'menu', 'alive', 'stats'];

export async function runSelfTestOndeEstou(_adapter: SelfTestAdapter, _target: string): Promise<void> {
  log('$ondeestou permanece fora do auto-teste por depender de relay externo.');
}

export async function runSelfTestMod(adapter: SelfTestAdapter, target: string): Promise<void> {
  const state = globalThis as typeof globalThis & { __selftestModRan?: boolean };
  if (state.__selftestModRan) return;
  state.__selftestModRan = true;

  if (adapter.selfTestHandleKeywords) {
    const replies: string[] = [];
    const intercepted = await adapter.selfTestHandleKeywords({
      body: 'bot',
      mentionedIds: [],
      author: target,
      from: target,
      id: { _serialized: 'selftest-keyword' },
      reply: async (text: string) => { replies.push(text); return true; },
    });
    log(`[keyword] interceptado=${intercepted} respostas=${replies.length}`);
  }

  for (const command of COMMANDS) {
    try {
      await adapter.sendMessage(target, `$${command}`);
      log(`[command] enviado $${command}`);
      await new Promise(resolve => setTimeout(resolve, 3000));
    } catch (error: any) {
      log(`[command] falha $${command}: ${error?.message || error}`);
    }
  }
  log('Auto-teste concluído; nenhuma ação destrutiva foi executada.');
}
