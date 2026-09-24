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

/** Procura por contextInfo em qualquer nível de um objeto de mensagem */
function findContextInfoInMessage(msg: any): any[] {
  const results: any[] = [];
  if (!msg || typeof msg !== 'object') return results;
  for (const key of Object.keys(msg)) {
    const val = msg[key];
    if (val && typeof val === 'object' && val.contextInfo !== undefined) {
      results.push({
        path: `message.${key}.contextInfo`,
        stanzaId: val.contextInfo.stanzaId || null,
        quotedMessage: val.contextInfo.quotedMessage ? 'present' : null,
        hasQuotedMessage: !!val.contextInfo.quotedMessage,
        contextInfoKeys: Object.keys(val.contextInfo),
      });
    }
    if (val && typeof val === 'object') {
      results.push(...findContextInfoInMessage(val));
    }
  }
  return results;
}

/** Inspeção recursiva completa da mensagem de resposta */
function inspectMessageRecursively(msg: any, path: string = 'message'): any[] {
  const results: any[] = [];
  if (!msg || typeof msg !== 'object') return results;

  if (msg.contextInfo) {
    results.push({
      path,
      stanzaId: msg.contextInfo.stanzaId || null,
      quotedMessage: msg.contextInfo.quotedMessage ? 'present' : null,
      hasQuotedMessage: !!msg.contextInfo.quotedMessage,
      contextInfoKeys: Object.keys(msg.contextInfo),
      contextInfo: msg.contextInfo,
    });
  }

  for (const key of Object.keys(msg)) {
    if (key === 'contextInfo' || key === 'stanzaId') continue;
    const val = msg[key];
    if (val && typeof val === 'object') {
      results.push(...inspectMessageRecursively(val, `${path}.${key}`));
    }
  }
  return results;
}

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

        // ─── Endpoint de teste do fluxo $menu completo ───
        if (req.url === '/lab/test-menu-flow') {
          const platform = parsedBody.platform || 'whatsapp';
          const chatId = parsedBody.chatId || '120363410094452673@g.us';
          const { adapter, sock } = getAdapterAndSock(platform);
          if (!adapter) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `Plataforma não encontrada: ${platform}` }));
            return;
          }
          if (!sock) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Socket não disponível' }));
            return;
          }

          // Enable lab mode for this test
          process.env.WPP_LAB_MODE = '1';

          try {
            logInfo('[TestServer] /lab/test-menu-flow: Enviando $menu para ' + chatId);
            const result = await pm.sendMessageAndProcess(platform, chatId, '$menu', true);
            logInfo('[TestServer] /lab/test-menu-flow: Fluxo concluído', { result });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, platform, chatId, result }));
          } catch (err: any) {
            logError('TestServer.test-menu-flow', err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
          } finally {
            // Disable lab mode after test
            delete process.env.WPP_LAB_MODE;
          }
          return;
        }

        // ─── Endpoint E2E real (laboratório) — valida quote/reação —──
        if (req.url === '/lab/e2e/test-quote-flow') {
          const platform = parsedBody.platform || 'whatsapp';
          const chatId = parsedBody.chatId || '120363410094452673@g.us';
          const originalMsgId = parsedBody.originalMsgId || 'test-msg-id';

          // Captura eventos de resposta via arquivo
          const capturesFile = path.join(process.cwd(), 'laboratorio', 'e2e-capture.jsonl');
          try { fs.mkdirSync(path.dirname(capturesFile), { recursive: true }); } catch {}

          // Configura captura persistente do adapter Baileys para eventos upsert
          const adapterForCapture = pm.getAdapter(platform as any);
          const sockForCapture = adapterForCapture ? (adapterForCapture.connection?.getSock?.() || adapterForCapture.sock || null) : null;
          if (sockForCapture && sockForCapture.ev) {
            // Listener único (não duplicar se já existia) — apenas adiciona se ainda não está registrado
            // Não removemos o listener anterior para evitar conflitos; adicionamos outro se necessário
            sockForCapture.ev.on('messages.upsert', (event: any) => {
              try {
                for (const msg of (event.messages || [])) {
                  const captureObj: any = {
                    type: 'messages.upsert',
                    timestamp: Date.now(),
                    msgKey: msg?.key ? {
                      id: msg?.key?.id,
                      remoteJid: msg?.key?.remoteJid,
                      fromMe: msg?.key?.fromMe,
                      participant: msg?.key?.participant,
                      participantAlt: msg?.key?.participantAlt,
                      addressingMode: msg?.key?.addressingMode,
                    } : null,
                    messageType: msg?.message ? Object.keys(msg?.message || {})[0] || 'empty' : 'none',
                    messageContent: msg?.message ? 'present' : 'empty',
                    // Preserva contexto se existir
                    contextInfo: msg?.message?.extendedTextMessage?.contextInfo ? {
                      stanzaId: msg?.message?.extendedTextMessage?.contextInfo?.stanzaId,
                      quotedMessage: msg?.message?.extendedTextMessage?.contextInfo?.quotedMessage ? 'present' : 'none',
                      participant: msg?.message?.extendedTextMessage?.contextInfo?.participant,
                    } : null,
                  };
                  const capturesFile = path.join(process.cwd(), 'laboratorio', 'e2e-capture.jsonl');
                  try {
                    fs.mkdirSync(path.dirname(capturesFile), { recursive: true });
                    fs.appendFileSync(capturesFile, JSON.stringify(captureObj) + '\n');
                  } catch {}
                }
              } catch {}
            });
          }

          process.env.WPP_LAB_MODE = '1';
          const result = await pm.sendMessageAndProcess(platform, chatId, '$menu', true);
          delete process.env.WPP_LAB_MODE;

          // Aguarda brevemente e lê capturas
          await new Promise(r => setTimeout(r, 2000));
          const captures: any[] = [];
          try {
            if (fs.existsSync(capturesFile)) {
              const lines = fs.readFileSync(capturesFile, 'utf8').trim().split('\n').filter(Boolean);
              for (const line of lines.slice(-20)) {
                try { captures.push(JSON.parse(line)); } catch {}
              }
            }
          } catch {}

          // Inspeciona mensagens capturadas para quote (stanzaId) e reaction
          let quotePass = false;
          let quoteStanzaId: string | undefined = undefined;
          let reactionPass = false;

          for (const cap of captures) {
            if (cap.type === 'messages.upsert') {
              const msg = cap.msg || cap;
              const cinfo = msg?.message?.extendedTextMessage?.contextInfo || msg?.message?.imageMessage?.contextInfo || {};
              const stanzaId = cinfo.stanzaId || msg?.contextInfo?.stanzaId;
              if (stanzaId && msg?.key?.fromMe === true) {
                quoteStanzaId = stanzaId;
                quotePass = stanzaId === originalMsgId;
              }
            }
            if (cap.type === 'reactionMessage' || (cap.msgType && String(cap.msgType).includes('reaction')) || (cap.msg && cap.msg === 'reactionMessage')) {
              reactionPass = true;
            }
          }

          // Se ainda não tem captures, retorna resultado do fluxo mas marca FAIL estrutural
          const structured = {
            ok: result?.success !== false,
            platform,
            chatId,
            result,
            labModeEnabled: process.env.WPP_LAB_MODE === '1',
            e2e: {
              originalMsgId,
              quote: {
                status: quotePass ? 'PASS_QUOTE' : (quoteStanzaId ? 'FAIL_QUOTE_STANZA_MISMATCH' : 'FAIL_QUOTE_NOT_PRESENT'),
                expectedStanzaId: originalMsgId,
                receivedStanzaId: quoteStanzaId || undefined,
                capturesInspected: captures.length,
                note: quotePass ? 'Quote confirmado estruturalmente (stanzaId corresponde)' : 'Quote NÃO confirmado — resposta não contém referência estrutural à mensagem original',
              },
              reaction: {
                status: reactionPass ? 'PASS_REACTION' : 'FAIL_REACTION_NOT_DETECTED',
                note: reactionPass ? 'Reação confirmada no evento messages.upsert' : 'Nenhum evento de reação capturado',
              },
            },
          };

          res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(structured, null, 2));
                    return;
                  }

                  // ─── Endpoint TESTE 1 ISOLADO — quote direto com WAMessage REAL (sock.sendMessage) ───
        if (req.url === '/lab/test1/isolated-quote') {
          const platform = parsedBody.platform || 'whatsapp';
          const chatId = parsedBody.chatId || '120363410094452673@g.us';
          const adapter = pm.getAdapter(platform as any);
          if (!adapter) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `Plataforma não encontrada: ${platform}` }));
            return;
          }
          const sock = adapter.connection?.getSock?.() || (adapter as any).sock || null;
          if (!sock) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Socket não disponível' }));
            return;
          }

          process.env.WPP_LAB_MODE = '1';

                    // Registrar listener para capturar messages.upsert para este teste
                    const capturesFile = path.join(process.cwd(), 'laboratorio', 'test1-capture.jsonl');
                    try { fs.mkdirSync(path.dirname(capturesFile), { recursive: true }); } catch {}
                    let quotePass = false;
                    let quoteStanzaId: string | undefined = undefined;
                    const sockForCapture = sock;
                    if (sockForCapture && sockForCapture.ev) {
                      sockForCapture.ev.on('messages.upsert', (event: any) => {
                        try {
                          for (const msg of (event.messages || [])) {
                            const cinfo = msg?.message?.extendedTextMessage?.contextInfo || msg?.message?.imageMessage?.contextInfo || {};
                            const stanzaId = cinfo.stanzaId;
                            if (stanzaId && msg?.key?.fromMe === true) {
                              // Escreve no JSONL para auditoria
                              const captureObj = {
                                type: 'messages.upsert',
                                timestamp: Date.now(),
                                msgKey: msg.key,
                                contextInfo: {
                                  stanzaId: cinfo.stanzaId || null,
                                  quotedMessage: cinfo.quotedMessage ? 'present' : 'none',
                                  participant: cinfo.participant || null,
                                },
                              };
                              try { fs.appendFileSync(capturesFile, JSON.stringify(captureObj) + '\n'); } catch {}
                              // Verifica se é o quote que estamos procurando
                              if (sentB && cinfo.stanzaId === sentB.key?.id) {
                                quotePass = true;
                                quoteStanzaId = cinfo.stanzaId;
                              }
                            }
                          }
                        } catch {}
                      });
                    }

                    // --- TESTE 1A: SEM QUOTE (controle) ---
          const markerA = `LAB_NO_QUOTE_${Date.now()}`;
          let sentA = null;
          let sentA_error = null;
          try {
            sentA = await sock.sendMessage(chatId, { text: markerA });
          } catch (e: any) {
            sentA_error = e?.message || String(e);
          }
          await new Promise(r => setTimeout(r, 2000));

          // --- TESTE 1B: COM QUOTE USANDO WAMessage REAL ---
          const markerB = `LAB_QUOTE_ORIGINAL_${Date.now()}`;
          let sentB = null;
          let replyB = null;
          let sentB_error = null;
          let replyB_error = null;
          try {
            sentB = await sock.sendMessage(chatId, { text: markerB });
            // TESTE 1C: Captura direta do WAMessage original em JSONL (sem depender de logInfo)
            const laboratorioDir = path.join(process.cwd(), 'laboratorio');
            if (!fs.existsSync(laboratorioDir)) {
              fs.mkdirSync(laboratorioDir, { recursive: true });
            }
            const captureFile = path.join(laboratorioDir, 'test1-capture.jsonl');
            // Limpa arquivo antigo para esta execução
            if (fs.existsSync(captureFile)) {
              fs.writeFileSync(captureFile, '');
            }
            // Registra o WAMessage original COMPLETO
            const sentBCapture: any = {
              timestamp: Date.now(),
              event: 'TESTE_1C_ORIGINAL_WAMESSAGE',
              source: 'sock.sendMessage(chatId, { text: markerB })',
              sentB: {
                key: sentB?.key ? {
                  id: sentB.key.id,
                  remoteJid: sentB.key.remoteJid,
                  fromMe: sentB.key.fromMe,
                  participant: sentB.key.participant || undefined,
                  participantAlt: sentB.key.participantAlt || undefined,
                  addressingMode: sentB.key.addressingMode || undefined,
                  ...(sentB.key.participantUsername !== undefined && { participantUsername: sentB.key.participantUsername }),
                } : null,
                message: sentB?.message ? {
                  keys: Object.keys(sentB.message),
                  raw: sentB.message,
                } : null,
                messageTimestamp: sentB?.messageTimestamp,
                participant: sentB?.participant,
                status: sentB?.status,
              },
              // Estrutura de contextInfo dentro do message de sentB
              sentB_message_contextInfo: sentB?.message ? findContextInfoInMessage(sentB.message) : null,
            };
            fs.appendFileSync(captureFile, JSON.stringify(sentBCapture) + '\n');

            await new Promise(r => setTimeout(r, 2000));
            replyB = await sock.sendMessage(chatId, { text: 'LAB_QUOTE_RESPONSE' }, { quoted: sentB });
            // TESTE 1D: Captura direta da resposta COMPLETA + inspeção recursiva em JSONL
            const replyBCapture: any = {
              timestamp: Date.now(),
              event: 'TESTE_1D_REPLY_WAMESSAGE',
              source: 'sock.sendMessage(chatId, { text: LAB_QUOTE_RESPONSE }, { quoted: sentB })',
              sentB_key_id: sentB?.key?.id,
              replyB: {
                key: replyB?.key ? {
                  id: replyB.key.id,
                  remoteJid: replyB.key.remoteJid,
                  fromMe: replyB.key.fromMe,
                  participant: replyB.key.participant || undefined,
                  participantAlt: replyB.key.participantAlt || undefined,
                  addressingMode: replyB.key.addressingMode || undefined,
                  ...(replyB.key.participantUsername !== undefined && { participantUsername: replyB.key.participantUsername }),
                } : null,
                message: replyB?.message ? {
                  keys: Object.keys(replyB.message),
                  raw: replyB.message,
                } : null,
                messageTimestamp: replyB?.messageTimestamp,
                participant: replyB?.participant,
                status: replyB?.status,
              },
              // Inspeção recursiva de replyB.message buscando contextInfo/stanzaId/quotedMessage em TODOS os níveis
              replyB_recursive_inspection: replyB?.message ? inspectMessageRecursively(replyB.message) : null,
            };
            fs.appendFileSync(captureFile, JSON.stringify(replyBCapture) + '\\n');
          } catch (e: any) {
            if (!sentB) sentB_error = e?.message || String(e);
            else replyB_error = e?.message || String(e);
          }

          // Aguarda respostas aparecerem no messages.upsert
          await new Promise(r => setTimeout(r, 5000));

          // Captura eventos via arquivo — reutiliza as variáveis já declaradas acima (capturesFile, quotePass, quoteStanzaId)
          let responseId: string | undefined = undefined;
          let responseFromMe: boolean | undefined = undefined;
          try {
            if (fs.existsSync(capturesFile)) {
              const lines = fs.readFileSync(capturesFile, 'utf8').trim().split('\n').filter(Boolean);
              for (const line of lines.slice(-20)) {
                try {
                  const cap = JSON.parse(line);
                  if (cap.type === 'messages.upsert' && cap.msgKey && cap.contextInfo?.stanzaId) {
                    // Verifica se esta resposta cita a mensagem original do TESTE 1B
                    if (sentB && cap.contextInfo.stanzaId === sentB.key?.id) {
                      quotePass = true;
                      quoteStanzaId = cap.contextInfo.stanzaId;
                    }
                  }
                } catch {}
              }
            }
          } catch {}

          const result = {
            ok: true,
            test: 'TESTE_1_ISOLADO_QUOTE',
            platform,
            chatId,
            test1a: {
              marker: `LAB_NO_QUOTE_...`,
              sendMessage: sentA ? 'OK' : 'FAIL',
              msgId: sentA?.key?.id || null,
              error: sentA_error,
            },
            test1b: {
              marker: `LAB_QUOTE_ORIGINAL_...`,
              sendMessageOriginal: sentB ? 'OK' : 'FAIL',
              originalMsgId: sentB?.key?.id || null,
              originalKey: sentB?.key || null,
              originalMessageKeys: sentB?.message ? Object.keys(sentB?.message || {}) : null,
              sendMessageReply: replyB ? 'OK' : 'FAIL',
              replyMsgId: replyB?.key?.id || null,
              replyError: replyB_error,
              quotedSent: sentB ? true : false,
            },
            quote: {
              status: quotePass ? 'PASS_QUOTE' : 'FAIL_QUOTE_NOT_PRESENT',
              expectedStanzaId: sentB?.key?.id || null,
              receivedStanzaId: quoteStanzaId || null,
              match: quotePass,
              note: quotePass ? 'Quote confirmado (response.contextInfo.stanzaId === original.key.id)' : 'Quote NÃO confirmado — resposta não contém stanzaId apontando para original',
            },
          };

          delete process.env.WPP_LAB_MODE;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result, null, 2));
          return;
        }


        // (TESTE_2 removido — substituído pelo TESTE_3 que compara diretamente sem hooks)

        // ─── Endpoint de comando de teste (existente) ───
        // ─── TESTE 3 — COMPARAÇÃO DECISIVA: direto vs PlatformManager ───
        if (req.url === '/lab/test3/compare-quotes') {
          const platform = parsedBody.platform || 'whatsapp';
          const chatId = parsedBody.chatId || '120363410094452673@g.us';
          const adapter = pm.getAdapter(platform as any);
          if (!adapter) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `Plataforma não encontrada: ${platform}` }));
            return;
          }
          const sock = adapter.connection?.getSock?.() || (adapter as any).sock || null;
          if (!sock) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Socket não disponível' }));
            return;
          }

          const laboratorioDir = path.join(process.cwd(), 'laboratorio');
          if (!fs.existsSync(laboratorioDir)) fs.mkdirSync(laboratorioDir, { recursive: true });
          const test3File = path.join(laboratorioDir, 'test3-compare.jsonl');
          if (fs.existsSync(test3File)) fs.writeFileSync(test3File, '');

          // Coletor de eventos para observar o que o Baileys efetivamente recebe
          const observedEvents: any[] = [];
          const collector = (eventName: string) => (ev: any) => {
            try {
              for (const msg of (ev.messages || [])) {
                const cinfo = msg?.message?.extendedTextMessage?.contextInfo
                  || msg?.message?.imageMessage?.contextInfo
                  || msg?.message?.videoMessage?.contextInfo
                  || msg?.message?.documentMessage?.contextInfo
                  || msg?.message?.audioMessage?.contextInfo
                  || msg?.message?.stickerMessage?.contextInfo
                  || (msg?.message?.conversation !== undefined ? { stanzaId: null, inlined: true } : null)
                  || null;
                const entry = {
                  observedAt: Date.now(),
                  sourceEvent: eventName,
                  key: msg.key,
                  messageType: Object.keys(msg.message || {}),
                  contextInfo: cinfo,
                };
                observedEvents.push(entry);
                fs.appendFileSync(test3File, JSON.stringify(entry) + '\n');
              }
            } catch {}
          };
          sock.ev.on('messages.upsert', collector('messages.upsert'));
          sock.ev.on('messages.update', collector('messages.update'));

          // ─── A) CAMINHO DIRETO ───
          const markerA = `LAB_DIRECT_${Date.now()}`;
          let sentDirect: any = null;
          try {
            sentDirect = await sock.sendMessage(chatId, { text: markerA });
          } catch (e: any) {}
          await new Promise(r => setTimeout(r, 1000));

          let replyDirect: any = null;
          try {
            replyDirect = await sock.sendMessage(chatId, { text: `LAB_DIRECT_QUOTE_${Date.now()}` }, { quoted: sentDirect });
          } catch (e: any) {}
          await new Promise(r => setTimeout(r, 2000));

          // ─── B) CAMINHO PLATFORMMANAGER ───
          const markerB = `LAB_PM_${Date.now()}`;
          let sentPM: any = null;
          try {
            sentPM = await sock.sendMessage(chatId, { text: markerB });
          } catch (e: any) {}
          await new Promise(r => setTimeout(r, 1000));

          // Criar PlatformMessage artificial com raw=sentPM
          const fakeMessage: any = {
            id: sentPM?.key?.id,
            platform: adapter.platform,
            chatId,
            userId: chatId,
            userName: 'LabTest',
            text: '$ping',
            timestamp: new Date(),
            isFromMe: false,
            forceProcess: true,
            isCommand: true,
            hasMedia: false,
            raw: sentPM,
          };

          let pmError: string | null = null;
          try {
            process.env.WPP_LAB_MODE = '1';
            await pm.handleIncomingMessage(fakeMessage);
            delete process.env.WPP_LAB_MODE;
          } catch (e: any) {
            pmError = e?.message || String(e);
            delete process.env.WPP_LAB_MODE;
          }
          await new Promise(r => setTimeout(r, 2000));

          // Remover listener
          sock.ev.removeAllListeners('messages.upsert');
          sock.ev.removeAllListeners('messages.update');

          // ─── ANÁLISE ───
          const findReplyTo = (sentKey: any) => {
            const target = sentKey?.id;
            if (!target) return null;
            for (const ev of observedEvents) {
              if (ev.key?.fromMe && ev.contextInfo?.stanzaId === target) {
                return ev;
              }
            }
            return null;
          };

          const directObserved = findReplyTo(sentDirect?.key);
          const pmObserved = findReplyTo(sentPM?.key);

          const directPass = directObserved?.contextInfo?.stanzaId === sentDirect?.key?.id;
          const pmPass = pmObserved?.contextInfo?.stanzaId === sentPM?.key?.id;

          // Comparação estrutural
          let structuralDiff: any = null;
          if (directObserved?.contextInfo && pmObserved?.contextInfo) {
            const d = directObserved.contextInfo;
            const p = pmObserved.contextInfo;
            structuralDiff = {
              directHasQuotedMessage: !!d.quotedMessage,
              pmHasQuotedMessage: !!p.quotedMessage,
              directQuotedMsgType: d.quotedMessage ? Object.keys(d.quotedMessage)[0] : null,
              pmQuotedMsgType: p.quotedMessage ? Object.keys(p.quotedMessage)[0] : null,
              directQuotedText: d.quotedMessage?.extendedTextMessage?.text || d.quotedMessage?.conversation || null,
              pmQuotedText: p.quotedMessage?.extendedTextMessage?.text || p.quotedMessage?.conversation || null,
              directParticipant: d.participant,
              pmParticipant: p.participant,
              directStanzaIdLen: d.stanzaId?.length,
              pmStanzaIdLen: p.stanzaId?.length,
              directStanzaId: d.stanzaId,
              pmStanzaId: p.stanzaId,
              sameStanzaIdLength: d.stanzaId?.length === p.stanzaId?.length,
              sameParticipant: d.participant === p.participant,
              sameQuotedMsgType: (d.quotedMessage ? Object.keys(d.quotedMessage)[0] : null) === (p.quotedMessage ? Object.keys(p.quotedMessage)[0] : null),
              sameQuotedText: (d.quotedMessage?.extendedTextMessage?.text || d.quotedMessage?.conversation || null) === (p.quotedMessage?.extendedTextMessage?.text || p.quotedMessage?.conversation || null),
            };
          }

          const result = {
            ok: true,
            test: 'TESTE_3_COMPARE_QUOTES',
            platform,
            chatId,
            direct: {
              sentKey: sentDirect?.key?.id || null,
              observed: directObserved ? {
                keyId: directObserved.key?.id,
                stanzaId: directObserved.contextInfo?.stanzaId,
                quotedMessage: directObserved.contextInfo?.quotedMessage ? 'present' : 'absent',
                quotedMsgType: directObserved.contextInfo?.quotedMessage ? Object.keys(directObserved.contextInfo.quotedMessage)[0] : null,
                participant: directObserved.contextInfo?.participant,
              } : null,
              result: directPass ? 'PASS' : 'FAIL',
            },
            platformManager: {
              sentKey: sentPM?.key?.id || null,
              observed: pmObserved ? {
                keyId: pmObserved.key?.id,
                stanzaId: pmObserved.contextInfo?.stanzaId,
                quotedMessage: pmObserved.contextInfo?.quotedMessage ? 'present' : 'absent',
                quotedMsgType: pmObserved.contextInfo?.quotedMessage ? Object.keys(pmObserved.contextInfo.quotedMessage)[0] : null,
                participant: pmObserved.contextInfo?.participant,
              } : null,
              result: pmPass ? 'PASS' : 'FAIL',
              error: pmError,
            },
            comparison: {
              directPass,
              pmPass,
              bothPass: directPass && pmPass,
              structurallyEquivalent: structuralDiff
                ? (structuralDiff.sameStanzaIdLength && structuralDiff.sameParticipant && structuralDiff.sameQuotedMsgType && structuralDiff.sameQuotedText)
                : null,
              diffDetails: structuralDiff,
            },
            totalObservedEvents: observedEvents.length,
            allEvents: observedEvents.map(e => ({
              observedAt: e.observedAt,
              sourceEvent: e.sourceEvent,
              keyId: e.key?.id,
              fromMe: e.key?.fromMe,
              stanzaId: e.contextInfo?.stanzaId,
              hasQuotedMessage: !!e.contextInfo?.quotedMessage,
            })),
          };

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result, null, 2));
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
