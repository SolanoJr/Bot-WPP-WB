/**
 * healthStore — armazena o status de saúde do WPP de forma desacoplada.
 * O WhatsAppAdapter escreve aqui (no ready / forceReconnect) e o MetricsService
 * lê no endpoint /health, diferenciando "PM2 online" de "WPP realmente conectado".
 */

export interface WppHealth {
  wpp: 'connected' | 'awaiting-qr' | 'disconnected';
  pm2: 'online';
  sinceActivitySec: number;
  sinceConnectSec: number;
  qrPending: boolean;
  updatedAt: string;
}

let current: WppHealth = {
  wpp: 'disconnected',
  pm2: 'online',
  sinceActivitySec: 0,
  sinceConnectSec: 0,
  qrPending: false,
  updatedAt: new Date().toISOString(),
};

export function setWppHealth(h: Omit<WppHealth, 'pm2' | 'updatedAt'>): void {
  current = { ...h, pm2: 'online', updatedAt: new Date().toISOString() };
}

export function getWppHealth(): WppHealth {
  return current;
}