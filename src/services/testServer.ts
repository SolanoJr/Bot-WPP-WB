import http from 'node:http';
import { PlatformManager } from '../platforms/PlatformManager';
import logger from './loggerService';

/**
 * Servidor de testes HTTP na porta 3004.
 * Permite injetar comandos diretamente no bot via POST /test
 *
 * Uso: curl -X POST http://localhost:3004/test -d '{"platform":"discord","command":"$menu"}'
 *
 * Endpoints de laboratório:
 *   POST /lab/find-message  - busca grupo pelo nome
 *   POST /lab/messages     - busca mensagens do grupo
 *   POST /lab/delete-message - deleta mensagem
 *   POST /lab/adapter      - status do adapter
 *
 * Nota de arquitetura: o PlatformManager é um singleton, mas o bundler (tsup)
 * pode instanciar escopos de módulo separados por bundle. A instância "viva"
 * (com adapters registrados) é publicada em `globalThis.__platformManager` por
 * multiPlatform.ts. Aqui preferimos `getInstance()`, caindo para o global se o
 * bundle corrente não compartilhar o mesmo escopo. Isso garante que o testServer
 * sempre opera sobre a instância real.
 */
export function startTestServer(port: number = 3004): void {
  const server = http.createServer((req, res) => {
    // Somente POST
    if (req.method !== 'POST') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Only POST allowed' }));
      return;
    }

    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        // Tentar parsear o body como JSON (para todos os endpoints)
        let parsedBody: any = {};
        try {
          parsedBody = JSON.parse(body);
        } catch {
          // Se não for JSON, continua como objeto vazio
        }

        const pm: PlatformManager =
          (globalThis as any).__platformManager || PlatformManager.getInstance();

        // ─── Endpoint de descoberta de grupo (para laboratório) ───
        if (req.url === '/lab/find-message') {
          const { platform, groupName } = parsedBody;
          if (!platform || !groupName) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing platform or groupName' }));
            return;
          }
          const adapter = pm.getAdapter(platform as any);
          if (!adapter) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `Plataforma não encontrada: ${platform}` }));
            return;
          }
          const sock = (adapter as any).sock;
          if (!sock?.store?.chats) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Store indisponível', sockAvailable: !!sock }));
            return;
          }
          const chats = Object.entries(sock.store.chats || {});
          const targetChat = chats.find(([jid, chat]: [string, any]) =>
            chat?.name === groupName || chat?.subject === groupName);
          if (!targetChat) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `Grupo não encontrado: ${groupName}`, available: chats.length }));
            return;
          }
          const [groupJid] = targetChat;
          const messages = sock.store.messages?.[groupJid];
          const msgCount = messages ? (messages instanceof Map ? messages.size : Object.keys(messages).length) : 0;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            ok: true,
            platform,
            groupName,
            groupJid,
            messageCount: msgCount,
            chatInfo: {
              id: groupJid,
              name: sock.store.chats[groupJid]?.name || sock.store.chats[groupJid]?.subject || groupName,
            }
          }));
          return;
        }

        // ─── Endpoint de busca de mensagens do grupo (para laboratório) ───
        if (req.url === '/lab/messages') {
          const { platform, groupJid, limit } = parsedBody;
          if (!platform || !groupJid) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing platform or groupJid' }));
            return;
          }
          const adapter = pm.getAdapter(platform as any);
          if (!adapter) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `Plataforma não encontrada: ${platform}` }));
            return;
          }
          const sock = (adapter as any).sock;
          if (!sock?.store?.messages?.[groupJid]) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, messages: [], count: 0 }));
            return;
          }
          const msgStore = sock.store.messages[groupJid];
          const entries = msgStore instanceof Map ? Array.from(msgStore.entries()) : Object.entries(msgStore);
          const limited = entries.slice(0, limit || 100);
          const messages: Array<{ key: any; message: any; receivedAt: number }> = [];
          for (const [msgId, msgData] of limited) {
            if (!msgData) continue;
            const msg = msgData instanceof Map ? msgData : msgData;
            const key = msg.key || msgData?.key;
            if (!key) continue;
            messages.push({
              key: key,
              message: msg.message || msg,
              receivedAt: msg.messageTimestamp ? Number(msg.messageTimestamp) * 1000 : Date.now(),
            });
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, messages, count: messages.length, groupJid }));
          return;
        }

        // ─── Endpoint de delete de mensagem (para laboratório) ───
        if (req.url === '/lab/delete-message') {
          const { platform, groupJid, messageId, participant, fromMe } = parsedBody;
          if (!platform || !groupJid || !messageId) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing required fields: platform, groupJid, messageId' }));
            return;
          }
          const adapter = pm.getAdapter(platform as any);
          if (!adapter) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `Plataforma não encontrada: ${platform}` }));
            return;
          }
          // Cast para any — o PlatformAdapter interface não tem sendMessage,
          // mas os adapters concretos (BaileysAdapter) possuem.
          const baileysAdapter = adapter as any;
          const deleteMsg: any = { id: messageId, fromMe: !!fromMe };
          if (participant) deleteMsg.participant = participant;
          const result = await baileysAdapter.sendMessage(groupJid, '', { delete: deleteMsg });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, result, messageId, groupJid }));
          return;
        }

        // ─── Endpoint de status do adapter (para laboratório) ───
        if (req.url === '/lab/adapter') {
          const { platform } = parsedBody;
          if (!platform) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing platform' }));
            return;
          }
          const adapter = pm.getAdapter(platform as any);
          if (!adapter) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `Plataforma não encontrada: ${platform}` }));
            return;
          }
          const sock = (adapter as any).sock;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            ok: true,
            platform,
            adapterId: adapter?.platform,
            connected: !!sock?.user,
            userId: sock?.user?.id || null,
            storeAvailable: !!sock?.store,
          }));
          return;
        }

        // ─── Endpoint de comando de teste (existente) ───
        const { platform, command } = parsedBody;
        if (!platform || !command) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing platform or command' }));
          return;
        }
        const trimmed = command.trim();
        if (!trimmed.startsWith('$')) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Command must start with $' }));
          return;
        }
        const adapter = pm.getAdapter(platform as any);
        if (!adapter) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Plataforma não encontrada: ${platform}` }));
          return;
        }
        const result = await pm.executeTestCommand(platform, command);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, platform, command, result }));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
  });

  server.listen(port, '127.0.0.1', () => {
    logger.info(`[TestServer] Servidor de testes iniciado`, { port });
    logger.info(`[TestServer] endpoints: /test, /lab/find-message, /lab/messages, /lab/delete-message, /lab/adapter`);
  });
}
