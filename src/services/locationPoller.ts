/**
 * locationPoller.ts — Polling de localização recebida via Relay.
 *
 * O comando $ondeestou gera um link e adiciona o chatId em global.pendingChatIds.
 * O usuário clica, envia a localização (frontend -> relay POST /location), e o relay
 * guarda. Este poller busca a localização pendente e manda a resposta no chat.
 *
 * SEM este poller, o bot NUNCA responde após o usuário enviar a localização
 * (era o bug: o $ondeestou só gerava o link, faltava o lado de receber/responder).
 */

import axios from 'axios';
import { platformManager } from '../platforms/PlatformManager';

const RELAY_URL = (process.env.RELAY_URL || 'https://bot-wpp-relay.onrender.com').trim();
const API_KEY = process.env.WARRIOR_AUTH_KEY || '';

let started = false;

export function startLocationPoller(intervalMs = 5000): void {
  if (started) return;
  started = true;

  if (!(global as any).pendingChatIds || typeof (global as any).pendingChatIds.add !== 'function') {
    (global as any).pendingChatIds = new Set<string>();
  }
  const pending = (global as any).pendingChatIds as Set<string>;

  console.log('[LocationPoller] Iniciado (polling a cada ' + intervalMs + 'ms em ' + RELAY_URL + ')');

  setInterval(async () => {
    if (pending.size === 0) return;
    console.log(`[LocationPoller] tick - pending.size=${pending.size} chats=${JSON.stringify(Array.from(pending))}`);
    for (const chatId of Array.from(pending)) {
      console.log(`[LocationPoller] processando chatId=${chatId}`);
      try {
        const url = `${RELAY_URL}/pending/${encodeURIComponent(chatId)}`;
        console.log(`[LocationPoller] GET ${url}`);
        const res = await fetch(url, {
          method: 'GET',
          headers: { 'x-api-key': API_KEY },
        });
        console.log(`[LocationPoller] GET ${chatId} -> status=${res.status}`);
        if (res.status === 204) continue;
        const data: any = await res.json().catch(() => null);
        console.log(`[LocationPoller] GET ${chatId} -> hasData=${!!data?.location}`);
        if (!data || !data.location) continue;
        const loc = data;
        const lat = Number(loc.location.lat);
        const lng = Number(loc.location.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

        const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;

        // Nome do grupo (se houver) para contexto na resposta.
        let groupName = '';
        try {
          const adapter = platformManager.getAdapter('whatsapp');
          if (adapter?.client?.getChat) {
            const cleanId = chatId.replace(/^wpp:/, '');
            const chat = await adapter.client.getChat(cleanId);
            groupName = (chat as any)?.name || '';
          }
        } catch { /* ignore */ }

        const text = [
          '📍 *Localização recebida!*',
          groupName ? `Grupo: ${groupName}` : '',
          `🔗 ${mapsUrl}`,
          loc.location.accuracy ? `🎯 Precisão: ~${Math.round(loc.location.accuracy)}m` : '',
        ].filter(Boolean).join('\n');

        const adapter = platformManager.getAdapter('whatsapp');
        if (adapter?.client?.sendMessage) {
          await adapter.client.sendMessage(chatId, text);
          console.log(`[LocationPoller] Localização enviada para ${chatId} (${lat},${lng})`);
        }
        pending.delete(chatId);
      } catch (e: any) {
        console.error('[LocationPoller] erro ao processar', chatId, ':', e?.message, '| status=', e?.response?.status, '| code=', e?.code);
      }
    }
  }, intervalMs);
}
