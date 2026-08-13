/**
 * 🔒 WarriorBlack - SessionManager (base de multi-número)
 *
 * Permite rodar MÚLTIPLAS contas WhatsApp (números) no mesmo processo,
 * cada uma com sua própria sessão Chromium (authDir isolado).
 *
 * Configuração via .env:
 *   WPP_SESSIONS=558581344211,559999999999
 *   (se omitido, usa WWEBJS_AUTH_DIR ou .wwebjs_auth — compatibilidade retroativa)
 *
 * Cada número vira um adapter registrado no PlatformManager sob a chave
 *   whatsapp:<phone>   (ex: 'whatsapp:558581344211')
 *
 * PRÓXIMOS PASSOS (quando for expandir de verdade):
 *   - O PlatformManager já aceita string como chave (PlatformType = string).
 *   - Comandos que hoje hardcoded 'whatsapp' devem iterar sobre as chaves
 *     whatsapp:* para operar em todas as sessões (ex: broadcast, $automod).
 *   - Para "administrar outra sessão facilmente", basta adicionar o número no
 *     WPP_SESSIONS e restartar (_PM2). Sem código extra.
 */

import { platformManager } from '../platforms/PlatformManager';
import { WhatsAppAdapter } from '../platforms/whatsapp/WhatsAppAdapter';
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
 */
export function registerWhatsAppSessions(): void {
  const configs = getSessionConfigs();

  if (configs.length === 0) {
    // Modo legado: 1 sessão (mantém comportamento atual)
    const legacyAdapter = new WhatsAppAdapter();
    platformManager.registerAdapter(legacyAdapter);
    console.log('[SessionManager] Modo legado: 1 sessão WhatsApp (WWEBJS_AUTH_DIR).');
    return;
  }

  for (const cfg of configs) {
    try {
      const adapter = new WhatsAppAdapter({ authDir: cfg.authDir });
      // Sobrescreve a chave padrão 'whatsapp' pela chave por número
      (adapter as any).platform = wppSessionKey(cfg.phone);
      platformManager.registerAdapter(adapter);
      console.log(`[SessionManager] Sessão WhatsApp registrada: ${wppSessionKey(cfg.phone)} (authDir=${cfg.authDir})`);
    } catch (error: any) {
      console.error(`[SessionManager] Erro ao registrar sessão ${cfg.phone}:`, error?.message);
    }
  }
}
