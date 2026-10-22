import { describe, it, expect, vi } from 'vitest';
import { PlatformManager } from '../../src/platforms/PlatformManager';

/**
 * INC-016 — startAll não pode pular o setup de handlers quando o
 * initialize() de um adapter rejeita no meio do caminho.
 *
 * Cenário real (pareamento WhatsApp 22/10): o socket de registro fecha
 * logo após o scan do QR (comportamento normal do fluxo de pair), o
 * initialize() rejeita com "Connection closed: unknown" e o adapter
 * reconecta sozinho. Antes do fix, o setupAdapterHandlers só rodava no
 * caminho feliz — com isso o normalizador nunca recebia o handler do PM
 * e TODAS as mensagens da plataforma morriam em `if (this.msgHandler)`.
 */

describe('PlatformManager.startAll — registro de handler com initialize rejeitado (INC-016)', () => {
  it('registra TODOS os handlers MESMO quando initialize() lança', async () => {
    const pm = PlatformManager.getInstance();
    const onMessage = vi.fn();
    const adapter: any = {
      platform: 'whatsapp',
      client: {
        onMessage,
        onReady: vi.fn(),
        onDisconnected: vi.fn(),
      },
      initialize: vi.fn(async () => {
        throw new Error('Connection closed: unknown');
      }),
    };
    pm.registerAdapter(adapter);

    // startAll não propaga a falha de uma plataforma isolada
    await expect(pm.startAll()).resolves.toBeUndefined();

    expect(adapter.initialize).toHaveBeenCalledTimes(1);
    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(adapter.client.onReady).toHaveBeenCalledTimes(1);
    expect(adapter.client.onDisconnected).toHaveBeenCalledTimes(1);
  });
});
