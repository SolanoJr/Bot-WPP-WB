/**
 * 🔒 WarriorBlack - SessionManager (base de multi-número)
 *
 * Permite rodar MÚLTIPLAS contas WhatsApp (números) no mesmo processo,
 * cada uma com sua própria sessão (authDir isolado).
 *
 * Configuração via .env:
 *   WPP_SESSIONS=558581344211,559999999999
 *   (se omitido, usa sessions/<phone> — compatibilidade retroativa)
 *
 * Engine: Baileys (único, sem Chromium). O fallback WWebJS foi removido
 * (ver BUG_TRACKER) — todas as funcionalidades foram acopladas no Baileys
 * (getNumberId, getContactById, sendMedia com voz, member-join, etc).
 *
 * Cada número vira um adapter registrado no PlatformManager sob a chave
 *   whatsapp:<phone>   (ex: 'whatsapp:558581344211')
 */

import { platformManager } from '../platforms/PlatformManager';
import { wppSessionKey } from '../platforms/base/PlatformTypes';

export interface SessionConfig {
  phone: string;
  authDir: string;
}

/**
 * Lê a configuração de sessões do .env.
 * Retorna [] se WPP_SESSIONS não estiver definido (modo legado: 1 sessão).
 */
export function getSessionConfigs(): SessionConfig[] {
  const raw = (process.env.WPP_SESSIONS || '').trim();
  if (!raw) return [];

  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((phone) => ({
      phone: phone.replace(/[^0-9]/g, ''),
      authDir: `sessions/${phone.replace(/[^0-9]/g, '')}`,
    }));
}

/**
 * Cria e registra os adapters WhatsApp para todas as sessões configuradas.
 * Se nenhuma sessão estiver em WPP_SESSIONS, cria a sessão legada (1 número)
 * usando WWEBJS_AUTH_DIR ou .wwebjs_auth.
 * Respeita WPP_ENGINE: 'baileys' (default) ou 'wwebjs'.
 */
export function registerWhatsAppSessions(): void {
  const configs = getSessionConfigs();

  if (configs.length === 0) {
    // Modo legado: 1 sessão (mantém comportamento atual)
    const { BaileysAdapter } = require('../platforms/whatsapp/BaileysAdapter');
    const legacyAdapter = new BaileysAdapter();
    platformManager.registerAdapter(legacyAdapter);
    console.log('[SessionManager] Modo legado: 1 sessão WhatsApp (Baileys).');
    return;
  }

  for (const cfg of configs) {
    try {
      const { BaileysAdapter } = require('../platforms/whatsapp/BaileysAdapter');
      const adapter = new BaileysAdapter({ authDir: cfg.authDir, platform: wppSessionKey(cfg.phone) });
      platformManager.registerAdapter(adapter);
      console.log(`[SessionManager] Sessão WhatsApp registrada: ${wppSessionKey(cfg.phone)} (authDir=${cfg.authDir}, engine=baileys)`);
    } catch (error: any) {
      console.error(`[SessionManager] Erro ao registrar sessão ${cfg.phone}:`, error?.message);
    }
  }
}
