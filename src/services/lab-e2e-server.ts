import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { logInfo, logError } from './loggerService';

/** Laboratório E2E real: captura messages.upsert e valida quote/reação */
const CAPTURE_FILE = path.join(process.cwd(), 'laboratorio', 'e2e-capture.jsonl');

function appendCapture(obj: any) {
  const dir = path.dirname(CAPTURE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(CAPTURE_FILE, JSON.stringify(obj) + '\n');
}

function readCaptures(): any[] {
  if (!fs.existsSync(CAPTURE_FILE)) return [];
  return fs.readFileSync(CAPTURE_FILE, 'utf8').trim().split('\n').filter(Boolean).map(l => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
}

export function startLabServer(port: number = 3005) {
  const server = http.createServer((req, res) => {
    if (req.method !== 'POST') {
      res.writeHead(405); res.end('POST only'); return;
    }
    let body = '';
    req.on('data', c => body += c.toString());
    req.on('end', async () => {
      try {
        const parsed = JSON.parse(body);
        if (req.url === '/lab/e2e/test-quote-flow') {
          // Iniciar captura de eventos
          const captures: any[] = [];
          const platform = parsed.platform || 'whatsapp';
          const chatId = parsed.chatId || '120363410094452673@g.us';
          const originalMsgId = parsed.originalMsgId || 'test-msg-id';

          // Capturar mensagens recebidas por 8 segundos
          const pm: any = (globalThis as any).__platformManager || require('../platforms/PlatformManager').PlatformManager.getInstance();
          const adapterObj: any = pm.getAdapter ? pm.getAdapter(platform) : null;
          const adapter: any = adapterObj;

          if (!adapter) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: `Adapter não encontrado: ${platform}` }));
            return;
          }

          let quoteFound = false;
          let quoteEvidence: any = null;
          let reactionFound = false;

          const sock = adapter.connection?.getSock?.() || adapter.sock || null;
          if (sock) {
            const listener = (evt: any) => {
              appendCapture({ type: 'message.event', timestamp: Date.now(), evt: evt ? JSON.stringify({ messages: evt.messages?.length, updates: evt.updates?.length }) : 'none' });
            };
            // Observa messages.upsert para capturar resposta real
            sock.ev?.on('messages.upsert', (event: any) => {
              for (const msg of (event.messages || [])) {
                appendCapture({
                  type: 'messages.upsert',
                  timestamp: Date.now(),
                  fromMe: msg.key?.fromMe,
                  remoteJid: msg.key?.remoteJid,
                  msgId: msg.key?.id,
                  messageContent: msg.message ? 'present' : 'empty',
                  contextInfo: msg.message?.extendedTextMessage?.contextInfo ? 'present' : 'none',
                  quotedMessage: msg.message?.extendedTextMessage?.contextInfo?.quotedMessage ? 'present' : 'none',
                  stanzaId: msg.message?.extendedTextMessage?.contextInfo?.stanzaId || 'undefined',
                  quotedStanzaId: msg.message?.extendedTextMessage?.contextInfo?.quotedMessage ? 'present' : 'none',
                });

                // Verifica se a resposta contém quote (stanzaId presente e igual ao original)
                const cinfo = msg.message?.extendedTextMessage?.contextInfo || msg.message?.imageMessage?.contextInfo || {};
                const quotedStanzaId = cinfo.stanzaId;
                if (quotedStanzaId && msg.key?.fromMe) {
                  quoteFound = true;
                  quoteEvidence = {
                    responseMsgId: msg.key?.id,
                    responseStanzaId: quotedStanzaId,
                    originalStanzaId: originalMsgId,
                    match: quotedStanzaId === originalMsgId,
                    quoteStructurallyConfirmed: quotedStanzaId === originalMsgId,
                  };
                }
              }
            });
          }

          // Envia $menu
          const pmReal = (globalThis as any).__platformManager || require('../platforms/PlatformManager').PlatformManager.getInstance();
          const res = await pmReal.sendMessageAndProcess(platform, chatId, '$menu', true);

          // Aguarda até 8 segundos para capturar resposta
          await new Promise(r => setTimeout(r, 8000));

          const result = {
            ok: res?.success !== false,
            commandProcessed: res?.commandProcessed,
            quote: {
              expectedStanzaId: originalMsgId,
              evidence: quoteEvidence,
              found: quoteFound,
              structurallyConfirmed: quoteEvidence?.match === true,
              status: quoteEvidence ? (quoteEvidence?.match ? 'PASS_QUOTE' : 'FAIL_QUOTE_STANZA_ID_MISMATCH') : (quoteFound ? 'FAIL_QUOTE_NO_EVIDENCE' : 'FAIL_QUOTE_NOT_PRESENT'),
            },
            reaction: {
              found: reactionFound,
              status: reactionFound ? 'PASS_REACTION' : 'FAIL_REACTION_NOT_DETECTED',
            },
            captureCount: readCaptures().length,
            captures: readCaptures(),
          };

          // Limpar captura após leitura (não apagar para auditoria)
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, endpoint: '/lab/e2e/test-quote-flow', result }, null, 2));
          return;
        }

        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Endpoint desconhecido', url: req.url }));
      } catch (e: any) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: e.message, endpoint: req.url }));
      }
    });
  });
  server.listen(port, '127.0.0.1', () => {
    logInfo(`[LabServer] Servidor E2E iniciado na porta ${port}`);
  });
  return server;
}
