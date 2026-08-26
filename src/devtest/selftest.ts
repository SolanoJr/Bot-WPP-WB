/**
 * Kit de auto-teste do Hermes (em produção, no Linux).
 * NÃO apagar esta pasta — é o laboratório de validação do dono.
 *
 * Dispara sob demanda (WPP_AUTOSELFTEST=1 no boot) ou via call direta.
 * Manda a LISTA de comandos (1x cada, espaçado) no grupo teste.
 * O bot processa cada comando normalmente — exatamente como se um humano tivesse digitado.
 *
 * Para testar um comando específico, edite a LISTA abaixo.
 */

export interface SelfTestAdapter {
  sendMessage(chatId: string, text: string, options?: any): Promise<any>;
}

function log(msg: string): void {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.log(`[SELFTEST ${ts}] ${msg}`);
}

// Lista de comandos a testar (1 por vez, isolado). Edite conforme a sequência.
// OBS: deixar vazio = NÃO dispara selftest (evita o bot encher o grupo sozinho).
// NUNCA deixar comando aqui no boot — o dono manda testar sob demanda.
const LISTA: string[] = [
  '$ping',
];

export async function runSelfTestOndeEstou(_adapter: SelfTestAdapter, _alvoTeste: string): Promise<void> {
  log('=== SELFTEST $ondeestou desligado (validado pelo dono) ===');
}

export async function runSelfTestMod(adapter: SelfTestAdapter, alvoTeste: string): Promise<void> {
  if (!LISTA.length) {
    log('LISTA vazia — nada a testar.');
    return;
  }
  if (typeof adapter.sendMessage !== 'function') {
    log('ERRO: adapter.sendMessage não é função.');
    return;
  }

  log(`=== SELFTEST iniciando (${LISTA.length} comando(s)) no grupo ${alvoTeste} ===`);
  for (const cmd of LISTA) {
    try {
      log(`[cmd] mandando "${cmd}" no grupo teste...`);
      await adapter.sendMessage(alvoTeste, cmd);
      await new Promise((r) => setTimeout(r, 3000));
    } catch (e: any) {
      log(`[cmd] FALHA ao mandar "${cmd}": ${e?.message}`);
    }
  }
  log('=== LISTA enviada. Leia o log das respostas. ===');
}
