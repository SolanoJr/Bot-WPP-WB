import http from 'node:http';
import { PlatformManager } from '../platforms/PlatformManager';
import { logInfo, logWarning, logError } from './loggerService';
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
        // Usa o JSONL de capturas para obter a WAMessageKey completa (com participantAlt, addressingMode, etc.)
        // e executa UMA ÚNICA tentativa de delete com a chave completa.
        // CORREÇÃO 2026-09-14: a chave de delete agora preserva todos os campos: id, remoteJid,
        // fromMe, participant, participantAlt, addressingMode, e outros campos opcionais presentes
        // na entrada do JSONL, em vez de reconstruir uma chave truncada.
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
          const sock = baileysAdapter.connection?.getSock?.() || (baileysAdapter as any).sock || null;
          if (!sock) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Socket não disponível', platform, groupJid, messageId }));
            return;
          }

          // Busca a mensagem no JSONL para obter a chave completa
          const entries = readCaptures().filter(
            (c: any) => c.messageId === messageId && (c.groupId === groupJid || c.remoteJid === groupJid)
          );
          const targetEntry = entries[0] || null;

          // Constrói o WAMessageKey completo a partir do JSONL (se disponível) ou dos parâmetros
          const deleteKey: any = {
            id: messageId,
            remoteJid: groupJid,
            fromMe: !!fromMe,
          };
          if (targetEntry) {
            // Usa os campos completos do JSONL
            deleteKey.participant = targetEntry.participant || participant || '';
            deleteKey.participantAlt = targetEntry.rawPayloadSafe?.key?.participantAlt;
            deleteKey.addressingMode = targetEntry.rawPayloadSafe?.key?.addressingMode;
            deleteKey.server_id = targetEntry.rawPayloadSafe?.key?.server_id;
            // Campos additional do WAMessageKey
            if (targetEntry.rawPayloadSafe?.key?.remoteJidAlt) deleteKey.remoteJidAlt = targetEntry.rawPayloadSafe.key.remoteJidAlt;
            if (targetEntry.rawPayloadSafe?.key?.participantUsername) deleteKey.participantUsername = targetEntry.rawPayloadSafe.key.participantUsername;
          } else if (participant) {
            deleteKey.participant = participant;
          }

          logInfo('[TestServer] /lab/delete-message: construída WAMessageKey completa para envio', {
            messageId, groupJid, deleteKey,
          });

          // Validações de proteção
          const isFromBot = !!(deleteKey.fromMe);
          if (isFromBot) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              attempted: true,
              requestSent: false,
              messageKey: deleteKey,
              confirmation: 'blocked',
              reason: 'Proteção: não deletar mensagem do próprio bot (fromMe=true)',
            }));
            return;
          }

          // Confirmação de que está no grupo correto
          if (deleteKey.remoteJid !== groupJid) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              attempted: true,
              requestSent: false,
              messageKey: deleteKey,
              confirmation: 'blocked',
              reason: `remoteJid (${deleteKey.remoteJid}) não corresponde ao groupJid (${groupJid})`,
            }));
            return;
          }

          try {
            // Evento de confirmação: ouvir messages.update logo antes do delete
            let confirmationEvent: any = null;
            let sendResult: any = null;
            if (sock.ev) {
              const unload = () => {
                try { sock.ev.off('messages.update', updateListener); } catch {}
                try { sock.ev.off('messages.delete', deleteListener); } catch {}
              };
              const updateListener = (data: any) => {
                if (Array.isArray(data) && data.length > 0) {
                  for (const update of data) {
                    if (update?.key?.id === messageId) {
                      confirmationEvent = { type: 'messages.update', data: update };
                      logInfo('[TestServer] MESSAGES_UPDATE_EVENT', { messageId, update: update });
                    }
                  }
                }
              };
              const deleteListener = (data: any) => {
                if (data?.keys?.some((k: any) => k?.id === messageId)) {
                  confirmationEvent = { type: 'messages.delete', data };
                  logInfo('[TestServer] MESSAGES_DELETE_EVENT', { messageId, keys: data.keys });
                }
              };
              sock.ev.on('messages.update', updateListener);
              sock.ev.on('messages.delete', deleteListener);
              
              // Aguarda evento por até 8s após o delete
              const waitForConfirmation = new Promise<any>((resolve) => {
                const timeout = setTimeout(() => resolve(null), 8000);
                const check = setInterval(() => {
                  if (confirmationEvent) {
                    clearTimeout(timeout);
                    clearInterval(check);
                    resolve(confirmationEvent);
                  }
                }, 100);
              });

              const deletePromise = baileysAdapter.sendMessage(groupJid, '', { delete: deleteKey });
              const [sr, evt] = await Promise.all([deletePromise, waitForConfirmation]);
              sendResult = sr;
              unload();
              confirmationEvent = evt;
            } else {
              sendResult = await baileysAdapter.sendMessage(groupJid, '', { delete: deleteKey });
              confirmationEvent = null;
            }

            totalSuccess++;
            logInfo('[TestServer] /lab/delete-message: delete enviado — registrando resultado', {
              messageId, groupJid,
              deleteKey,
              sendResult: sendResult ? {
                key: sendResult.key,
                protocolMessage: sendResult.message?.protocolMessage || null,
                status: sendResult.status,
              } : null,
              confirmationEvent,
              conclusion: confirmationEvent ? 'confirmed' : 'not_confirmed',
            });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              attempted: true, 
              requestSent: true, 
              messageKey: deleteKey,
              confirmation: confirmationEvent ? 'confirmed' : 'not_confirmed',
              reason: confirmationEvent 
                ? `Evento ${confirmationEvent.type} recebido para ${messageId}`
                : 'sendMessage retornou sem erro, mas nenhum evento de confirmação (messages.update/messages.delete) foi recebido no período de espera. Isso NÃO confirma que a mensagem foi apagada visualmente.',
              sendMessageResult: sendResult ? {
                key: sendResult.key,
                protocolMessage: sendResult.message?.protocolMessage || null,
                status: sendResult.status,
              } : null,
              confirmationEvent: confirmationEvent || null,
            }));
          } catch (err: any) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
              attempted: true, 
              requestSent: false, 
              messageKey: deleteKey,
              confirmation: 'error',
              reason: err?.message || String(err),
            }));
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
          // Mensagem comum (não é comando) - enviar diretamente sem processar
          const adapter = pm.getAdapter(platform as any);
          if (!adapter) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `Plataforma não encontrada: ${platform}` }));
            return;
          }
          const chatId = parsedBody.chatId || '120363410094452673@g.us';
          logInfo(`[TestServer] Enviando mensagem: "${trimmed}" para ${chatId}`);
          const result = await pm.sendMessageAndProcess(platform, chatId, trimmed, false);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, platform, command: trimmed, result }));
          return;
        }
        const adapter = pm.getAdapter(platform as any);
        if (!adapter) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Plataforma não encontrada: ${platform}` }));
          return;
        }
        const result = await pm.sendMessageAndProcess(platform, parsedBody.chatId, command, true);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, platform, command, result }));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
  });

  server.listen(port, '127.0.0.1', () => {
    logInfo(`[TestServer] Servidor de testes iniciado`, { port });
    logInfo(`[TestServer] endpoints: /test, /lab/find-message, /lab/messages, /lab/delete-message, /lab/adapter, /lab/groups, /lab/stats`);
  });
}
