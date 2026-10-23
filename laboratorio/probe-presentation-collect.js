/**
 * Probe: o coletor de apresentações abre sessão para o normMsg do inject?
 * Roda o handlePresentationCollect REAL (dist) contra o DB REAL e reporta
 * cada gate. NÃO publica nada — apenas ispeciona o Map de sessões.
 */
require('dotenv').config();
const path = require('path');

async function main() {
  const svc = await import(path.resolve('dist/services/presentationService.js'));
  const welcome = await import(path.resolve('dist/services/welcomeService.js'));

  const chatId = '120363410094452673@g.us';
  const senderId = '5585999999999@s.whatsapp.net';
  const text = 'Oi, sou o João, tenho 30 anos, trabalho com TI';

  console.log('gate1 community:', await svc.isCommunity085Group(chatId));
  console.log('gate2 enabled  :', await welcome.isPresentationEnabled(chatId));
  console.log('sinais         :', svc.countPresentationSignals(text));

  const normMsg = {
    chatId, senderId, text,
    messageId: 'probe-' + Date.now(),
    isFromMe: false,
    platform: 'whatsapp',
  };
  await svc.handlePresentationCollect(normMsg);

  const active = svc.getActiveSession(chatId, senderId);
  console.log('sessão aberta  :', active ? `trigger=${active.trigger} status=${active.status}` : 'NÃO');
  if (active) {
    const stale = svc.findStaleSessions(0);
    console.log('stale(0ms)     :', stale.length);
    const { record } = await svc.consolidateStale(0);
    console.log('consolidou     :', record ? `${record.presentation_id} nome=${record.nome} idade=${record.idade} trabalho=${record.trabalho}` : 'NÃO');
  }
  process.exit(0);
}
main().catch((e) => { console.error('PROBE_ERR', e); process.exit(1); });
