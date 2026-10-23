/**
 * probe-forward-212.js — prova de entrega da apresentação consolidada.
 *
 * A msg 212 do chat 146078742 é a apresentação de teste publicada às 20:19
 * (tg_message_id gravado no DB). O usuário reporta que não chegou. Este probe
 * faz forwardMessage(146078742, 146078742, 212): se a mensagem existir, ela é
 * re-entregue ao privado (evidência visual para o dono) e o response mostra o
 * conteúdo; se não existir, o Telegram responde o erro real (message to
 * forward not found / chat not found), que settle a investigação.
 *
 * Execução: cd ~/bot-wpp && node laboratorio/probe-forward-212.js
 * (dotenv resolve o token do próprio .env; o token nunca é impresso.)
 */
require('dotenv').config();
const { Telegraf } = require('telegraf');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT = '146078742';
const MSG_ID = 212;

if (!TOKEN) {
  console.log('ERRO: TELEGRAM_BOT_TOKEN ausente no .env');
  process.exit(1);
}

(async () => {
  const bot = new Telegraf(TOKEN);
  try {
    const res = await bot.telegram.forwardMessage(CHAT, CHAT, MSG_ID);
    console.log('FORWARD_OK message_id=', res.message_id);
    console.log('DATE=', new Date(res.date * 1000).toISOString());
    const text = res.text || res.caption || '(sem texto — mídia)';
    console.log('CONTENT=', JSON.stringify(text).slice(0, 600));
  } catch (e) {
    console.log('FORWARD_ERRO=', e?.message);
    // Diagnóstico complementar: o chat existe para este bot?
    try {
      const me = await bot.telegram.getMe();
      console.log('BOT=', me.username);
    } catch (e2) {
      console.log('GETME_ERRO=', e2?.message);
    }
  }
  process.exit(0);
})();
