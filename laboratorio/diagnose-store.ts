/**
 * laboratorio/diagnose-store.js
 *
 * Diagnóstico direto do store do Baileys via require.
 * Executar no servidor Linux: node dist/laboratorio/diagnose-store.js
 */
'use strict';

const http = require('http');
const BAILEYS_AUTH_DIR = process.env.WPP_AUTH_DIR || 'sessions';
const authDir = require('path').join(process.cwd(), BAILEYS_AUTH_DIR, '558581344211');

console.log('[DIAGNOSE] authDir:', authDir);
console.log('[DIAGNOSE] exists:', require('fs').existsSync(authDir));

// Tenta importar o Baileys e carregar o store
async function diagnose() {
  try {
    const baileys = require('@whiskeysockets/baileys');
    console.log('[DIAGNOSE] Baileys importado');
    console.log('[DIAGNOSE] version:', baileys.pkgInfo);

    const { useMultiFileAuthState } = baileys;
    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    console.log('[DIAGNOSE] Auth state carregado');
    console.log('[DIAGNOSE] creds keys:', Object.keys(state.creds || {}));
    console.log('[DIAGNOSE] has keys store:', !!state.keys);

    // Tenta criar o socket apenas para acessar o store
    const { makeWASocket } = baileys;
    const { version } = await baileys.fetchLatestBaileysVersion();

    // Cria o socket sem conectar (só para ter acesso ao store vazio)
    // NOTA: o store só é populado durante a conexão ativa
    const sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: baileys.makeCacheableSignalKeyStore(state.keys, baileys.logger),
      },
      emitOwnEvents: true,
      // Não conecta — só para acessar o store
    });

    console.log('[DIAGNOSE] Socket criado (sem conectar)');
    console.log('[DIAGNOSE] sock.user:', sock.user);
    console.log('[DIAGNOSE] sock.store:', !!sock.store);
    if (sock.store) {
      console.log('[DIAGNOSE] store keys:', Object.keys(sock.store));
      console.log('[DIAGNOSE] store.chats:', sock.store.chats);
      console.log('[DIAGNOSE] store.chats type:', sock.store.chats?.constructor?.name);
      console.log('[DIAGNOSE] store.messages:', !!sock.store.messages);
      console.log('[DIAGNOSE] store.messages type:', sock.store.messages?.constructor?.name);

      // Lista os chats disponíveis
      const chats = sock.store.chats || {};
      const chatEntries = chats instanceof Map ? Array.from(chats.entries()) : Object.entries(chats);
      console.log('[DIAGNOSE] chats count:', chatEntries.length);

      // Procura pelo grupo Figurinhas
      for (const [jid, chat] of chatEntries) {
        const name = (chat || {}).name || (chat || {}).subject || jid;
        console.log(`  chat: ${jid} → ${name}`);
        if (name === 'Figurinhas' || jid.includes('1772111940')) {
          console.log(`  ✓ ENCONTRADO: ${jid} (${name})`);

          // Tenta acessar as mensagens
          const messages = sock.store.messages?.[jid];
          if (messages) {
            const msgEntries = messages instanceof Map ? Array.from(messages.entries()) : Object.entries(messages);
            console.log(`    mensagens: ${msgEntries.length}`);
            for (const [msgId, msgData] of msgEntries.slice(0, 5)) {
              if (!msgData) continue;
              const msg = msgData instanceof Map ? msgData : msgData;
              const key = (msg.key || msgData?.key);
              console.log(`    → ${msgId}:`, {
                key: key?.id,
                fromMe: key?.fromMe,
                remoteJid: key?.remoteJid,
                participant: key?.participant,
                timestamp: key?.messageTimestamp,
                contentType: msg.message?.[Object.keys(msg.message || {})[0]] ? Object.keys(msg.message)[0] : 'N/A',
              });
            }
          }
        }
      }
    }

    sock.end();
    console.log('[DIAGNOSE] Done');
  } catch (err: any) {
    console.error('[DIAGNOSE] Erro:', err.message);
    console.error('[DIAGNOSE] Stack:', err.stack);
  }
}

diagnose();
