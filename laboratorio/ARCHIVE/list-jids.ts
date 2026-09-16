#!/usr/bin/env node
/**
 * laboratorio/list-jids.ts
 *
 * Lista todos os JIDs (grupos e contatos) conhecidos pelo bot.
 * Usa o testServer /lab/store-chats para acessar o store do Baileys.
 *
 * Uso: node dist/laboratorio/list-jids.js
 */
import fs from 'fs';
import path from 'path';
import http from 'http';

const RESULT_FILE = path.join(process.cwd(), 'laboratorio', 'jids-list.json');
const TEST_SERVER = 'http://127.0.0.1:3004';

function logInfo(m: string) { console.log(`[LIST-JIDS] ${m}`); }
function logWarn(m: string) { console.log(`[LIST-JIDS][WARN] ${m}`); }
function logError(m: string) { console.error(`[LIST-JIDS-ERR] ${m}`); }

function httpPost(url: string, body: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = JSON.stringify(body);
    const mod = u.protocol === 'https:' ? require('https') : http;
    const req = mod.request({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    }, (res: any) => {
      let b = '';
      res.on('data', (c: any) => b += c);
      res.on('end', () => {
        try { resolve(JSON.parse(b)); } catch { reject(new Error('parse error')); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

interface ChatInfo {
  jid: string;
  name?: string;
  isGroup: boolean;
  unreadCount?: number;
  lastMessage?: string;
}

async function fetchChatsFromTestServer(): Promise<ChatInfo[]> {
  logInfo('Buscando chats via testServer /lab/store-chats...');
  try {
    const resp = await httpPost(`${TEST_SERVER}/lab/store-chats`, { platform: 'whatsapp' });
    if (resp?.ok && Array.isArray(resp.chats)) {
      logInfo(`Encontrados ${resp.chats.length} chats no store`);
      return resp.chats.map((c: any) => ({
        jid: c.id || c.jid || '',
        name: c.name || c.notify || '',
        isGroup: c.id?.endsWith('@g.us') || false,
        unreadCount: c.unreadCount || 0,
      }));
    }
    logWarn('Resposta inesperada do testServer');
    return [];
  } catch (e: any) {
    logError(`Erro ao buscar chats: ${e?.message}`);
    return [];
  }
}

async function main(): Promise<void> {
  logInfo('═══════════════════════════════════════════════════════════════');
  logInfo('LISTANDO TODOS OS JIDs CONHECIDOS PELO BOT');
  logInfo('═══════════════════════════════════════════════════════════════');

  const chats = await fetchChatsFromTestServer();

  if (chats.length === 0) {
    logWarn('Nenhum chat encontrado.');
    return;
  }

  const groups = chats.filter(c => c.isGroup);
  const contacts = chats.filter(c => !c.isGroup);

  logInfo('═══ GRUPOS ═══');
  for (const g of groups) {
    logInfo(`  ${g.jid}  name="${g.name || '(sem nome)'}"  unread=${g.unreadCount}`);
  }

  logInfo(`\n═══ CONTATOS (privados) ═══`);
  for (const c of contacts) {
    logInfo(`  ${c.jid}  name="${c.name || '(sem nome)'}"  unread=${c.unreadCount}`);
  }

  logInfo(`\n═══ RESUMO ═══`);
  logInfo(`Total: ${chats.length} | Grupos: ${groups.length} | Contatos: ${contacts.length}`);

  // Salvar resultado
  fs.mkdirSync(path.dirname(RESULT_FILE), { recursive: true });
  fs.writeFileSync(RESULT_FILE, JSON.stringify({
    listedAt: new Date().toISOString(),
    total: chats.length,
    groups: groups.map(g => ({ jid: g.jid, name: g.name })),
    contacts: contacts.map(c => ({ jid: c.jid, name: c.name })),
  }, null, 2), 'utf-8');
  logInfo(`Resultado salvo em: ${RESULT_FILE}`);
}

main().catch((e) => { logError(`Fatal: ${e}`); process.exit(1); });
