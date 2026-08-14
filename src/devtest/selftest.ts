/**
 * selftest.ts — Testes autônomos em PRODUÇÃO feitos pelo PRÓPRIO BOT.
 *
 * Objetivo: o Hermes (operando como o bot 558581344211@c.us, logado no Linux)
 * se auto-testa mandando comandos reais no grupo teste, marcando alvos válidos.
 *
 * REGRA DE OURO (anotada depois de 93847298374 falhas):
 *  - O comando $kick/$ban EXIGE uma MENÇÃO REAL resolvida pelo WWebJS.
 *  - Para marcar, passe em `mentions:[tid]` o `id._serialized` CRU do participant
 *    (NÃO fazer .replace('@lid','@c.us') — isso corrompe e a menção não é criada).
 *  - Só funciona se o alvo for um NÃO-ADMIN e diferente de mim (bot).
 *  - Se o grupo teste não tiver não-admin, o teste avisa e não faz nada (não loopa).
 *
 * O bot NÃO processa comando de chat privado de OUTRO número (só grupo/self).
 * Por isso o self-test usa message_create (bot manda $kick com mentions -> dispara).
 *
 * Este arquivo NUNCA deve ser apagado após o teste funcionar. É o "kit de teste"
 * do Hermes. Para desligar em produção, basta não definir WPP_TEST_GROUP_ID.
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
 * Roda os auto-testes em produção.
 * @param adapter adapter do WhatsApp (tem sendMessage + innerClient)
 * @param alvoTeste JID do grupo teste (ex: 120363410094452673@g.us)
 */
export async function runSelfTests(adapter: SelfTestAdapter, alvoTeste: string): Promise<void> {
  log('=== INICIANDO SELFTEST (VC = bot 558581344211) ===');
  try {
    const grp = await adapter.innerClient.getChatById(alvoTeste);
    const me = adapter.innerClient.info.wid._serialized;
    const participants: any[] = grp.participants || [];

    const target = participants.find((p: any) => {
      const pid = String(p.id?._serialized || p.id || '');
      return pid !== me && !p.isAdmin && !p.isSuperAdmin;
    });

    if (!target) {
      log('NENHUM alvo não-admin no grupo teste — self-test de kick pulado (não há o que marcar).');
    } else {
      const tid = String(target.id?._serialized || target.id); // CRU, sem replace!
      // TEXTO com @<numero> + mentions[] = WWebJS cria (ou extractMentions faz fallback).
      log(`Alvo encontrado: ${tid} — mandando SÓ $kick com menção`);
      await adapter.sendMessage(alvoTeste, `$kick @${tid}`, { mentions: [tid] } as any);
      log(`$kick enviado marcando ${tid}`);
    }

    log('=== SELFTEST (só $kick) agendado. Verifique o log estável do Linux para o resultado. ===');
  } catch (e: any) {
    log(`FALHA no self-test: ${e?.message}`);
  }
}
