import http from 'node:http';
import { PlatformManager } from '../platforms/PlatformManager';
import logger from './loggerService';
import fs from 'node:fs';
import path from 'node:path';

/** Caminho do arquivo de capturas */
const CAPTURE_FILE = path.join(process.cwd(), 'laboratorio', 'captured-messages.jsonl');

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
        // Usa o JSONL de capturas em vez do store do Baileys (store não disponível em rc14).
        if (req.url === '/lab/find-message') {
          const { platform, groupName } = parsedBody;
          if (!platform || !groupName) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing platform or groupName' }));
            return;
          }
          // Para Figurinhas, usamos o JID conhecido (sem depender do store de chats)
          const FIGURINHAS_GROUP = '5585981344211-1772111940@g.us';
          const knownGroups: Record<string, string> = { 'Figurinhas': FIGURINHAS_GROUP };
          const groupJid = knownGroups[groupName];
          if (!groupJid) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `Grupo desconhecido: ${groupName}` }));
            return;
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

        // ─── Endpoint de histórico via fetchMessageHistory ──────────────────
        if (req.url === '/lab/history') {
          const { platform, groupJid, oldestMsgId, oldestMsgTimestamp, count } = parsedBody;
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
          // O Baileys rc14 expõe fetchMessageHistory no socket
          const sock = (adapter as any).sock;
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
    logger.info(`[TestServer] endpoints: /test, /lab/find-message, /lab/messages, /lab/delete-message, /lab/adapter`);
  });
}
