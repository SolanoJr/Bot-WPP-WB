import http from 'node:http';
import { PlatformManager } from '../platforms/PlatformManager';
import logger from './loggerService';
import fs from 'node:fs';
import path from 'node:path';

/** Caminho do arquivo de capturas */
const CAPTURE_FILE = path.join(process.cwd(), 'laboratorio', 'captured-messages.jsonl');

// ─── Contadores de estatísticas ─────────────────────────────────────────────
let totalAttempts = 0;
let totalSuccess = 0;

function readCaptures(): Array<Record<string, any>> {
  if (!fs.existsSync(CAPTURE_FILE)) return [];
  try {
    const text = fs.readFileSync(CAPTURE_FILE, 'utf-8').trim();
    if (!text) return [];
    return text.split('\n').filter(Boolean).map((line: string) => {
      try { return JSON.parse(line); } catch { return null as any; }
    }).filter((r: any): r is Record<string, any> => r != null);
  } catch { return []; }
}

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
 *   POST /lab/groups       - lista todos os grupos ativos
 *   GET  /lab/stats        - retorna estatísticas de uso (total_attempts, total_success)
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
    // Somente POST e GET
    if (req.method !== 'POST' && req.method !== 'GET') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Only POST/GET allowed' }));
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

        // Helper para obter adapter e socket Baileys com suporte a multi-sessão
        function getAdapterAndSock(plat: string): { adapter: any; sock: any } {
          let adapter = pm.getAdapter(plat as any);
          if (!adapter && (plat === 'whatsapp' || plat.startsWith('whatsapp'))) {
            // Tenta prefixo
            const active = pm.getActivePlatforms ? pm.getActivePlatforms() : [];
            for (const p of active) {
              if (p.startsWith('whatsapp')) {
                adapter = pm.getAdapter(p as any);
                break;
              }
            }
          }
          const anyAdapter = adapter as any;
          const sock = anyAdapter ? (anyAdapter.connection?.getSock?.() || anyAdapter.sock || null) : null;
          return { adapter, sock };
        }

        // ─── Endpoint para listar todos os grupos ativos (para laboratório) ───
        if (req.url === '/lab/groups') {
          const platform = parsedBody.platform || 'whatsapp';
          const { adapter } = getAdapterAndSock(platform);
          if (!adapter) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `Plataforma não encontrada: ${platform}` }));
            return;
          }
          try {
            const chats = await (adapter as any).getChats?.() || [];
            const groups = chats.filter((c: any) =>
              c.isGroup || (c.id && (c.id.endsWith('@g.us') || c.id.startsWith('tg:') || c.id.startsWith('dc:')))
            );
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, count: groups.length, groups }));
          } catch (err: any) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err?.message || String(err) }));
          }
          return;
        }

        // ─── Endpoint para retornar estatísticas de uso ───
        if (req.url === '/lab/stats') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            ok: true,
            stats: {
              total_attempts: totalAttempts,
              total_success: totalSuccess,
            },
          }));
          return;
        }

        // ─── Endpoint de descoberta de grupo (para laboratório) ───
        // Usa o JSONL de capturas em vez do store do Baileys (store não disponível em rc14).
        if (req.url === '/lab/find-message') {
          const { platform, groupName } = parsedBody;
          if (!platform || !groupName) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing platform or groupName' }));
            return;
          }
          // Tenta descobrir o JID dinamicamente via getChats primeiro
          let groupJid = '';
          const { adapter } = getAdapterAndSock(platform);
          if (adapter) {
            try {
              const chats = await (adapter as any).getChats?.() || [];
              const found = chats.find((c: any) =>
                (c.name && c.name.toLowerCase().includes(groupName.toLowerCase())) ||
                (c.raw?.subject && c.raw.subject.toLowerCase().includes(groupName.toLowerCase()))
              );
              if (found) groupJid = found.id;
            } catch { /* fallback */ }
          }
          if (!groupJid) {
            const knownGroups: Record<string, string> = {
              'Figurinhas': '120363419033272638@g.us',
              'Figurinhas/Stickers': '120363419033272638@g.us',
            };
            groupJid = knownGroups[groupName] || '5585981344211-1772111940@g.us';
          }
          const entries = readCaptures().filter(
            (c: any) => c.groupId === groupJid || c.remoteJid === groupJid || c.participant === groupJid
          );
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            ok: true,
            platform,
            groupName,
            groupJid,
            messageCount: entries.length,
            chatInfo: { id: groupJid, name: groupName },
          }));
          return;
        }

        // ─── Endpoint de busca de mensagens do grupo (para laboratório) ───
        // Usa o JSONL de capturas em vez do store do Baileys (store não disponível em rc14).
        if (req.url === '/lab/messages') {
          const { platform, groupJid, limit } = parsedBody;
          if (!platform || !groupJid) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing platform or groupJid' }));
            return;
          }
          const entries = readCaptures()
            .filter((c: any) => c.groupId === groupJid || c.remoteJid === groupJid || c.participant === groupJid)
            .slice(0, limit || 200);
          const messages: Array<{ key: any; message: any; receivedAt: number }> = entries.map((e: any) => ({
            key: { id: e.messageId, remoteJid: e.remoteJid, participant: e.participant, fromMe: e.fromMe },
            message: (e.rawPayloadSafe || {})['message'] || {},
            receivedAt: e.timestamp,
          }));
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
          totalAttempts++;
          const { adapter } = getAdapterAndSock(platform);
          if (!adapter) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `Plataforma não encontrada: ${platform}` }));
            return;
          }
          const baileysAdapter = adapter as any;
          const deleteMsg: any = { id: messageId, fromMe: !!fromMe };
          if (participant) deleteMsg.participant = participant;
          try {
            const result = await baileysAdapter.sendMessage(groupJid, '', { delete: deleteMsg });
            totalSuccess++;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, result, messageId, groupJid }));
          } catch (err: any) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: err?.message || String(err), messageId, groupJid }));
          }
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
          const { adapter, sock } = getAdapterAndSock(platform);
          if (!adapter) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `Plataforma não encontrada: ${platform}` }));
            return;
          }
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

        // ─── Endpoint de histórico via fetchMessageHistory ──────────────────
        if (req.url === '/lab/history') {
          const { platform, groupJid, oldestMsgId, oldestMsgTimestamp, count } = parsedBody;
          if (!platform || !groupJid) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing platform or groupJid' }));
            return;
          }
          const { adapter, sock } = getAdapterAndSock(platform);
          if (!adapter) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `Plataforma não encontrada: ${platform}` }));
            return;
          }
          if (!sock?.fetchMessageHistory) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'fetchMessageHistory não disponível neste socket' }));
            return;
          }
          try {
            const oldestKey = {
              id: oldestMsgId || '__MOST_RECENT__',
              remoteJid: groupJid,
              fromMe: false,
              participant: oldestMsgId ? '' : (sock?.user?.id || ''),
            };
            const historyResponse = await sock.fetchMessageHistory(
              count || 200,
              oldestKey,
              oldestMsgTimestamp || Date.now()
            );
            // O servidor retorna um XML/String — tente parsear
            let messages: any[] = [];
            try {
              // Pode vir como JSON string ou XML — tentamos ambos
              if (typeof historyResponse === 'string') {
                try {
                  messages = JSON.parse(historyResponse);
                } catch {
                  // Se não for JSON, retornamos o raw para diagnóstico
                  messages = [{ _raw: historyResponse }];
                }
              } else {
                messages = [historyResponse];
              }
            } catch {
              messages = [{ _raw: String(historyResponse) }];
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, messages, count: messages.length, groupJid }));
          } catch (err: any) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
          }
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
    logger.info(`[TestServer] endpoints: /test, /lab/find-message, /lab/messages, /lab/delete-message, /lab/adapter, /lab/groups, /lab/stats`);
  });
}
