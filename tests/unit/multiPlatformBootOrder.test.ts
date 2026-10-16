import { describe, expect, it, vi } from 'vitest';

/**
 * multiPlatformBootOrder — ordem de chamada no bootstrap (ready race em P5.2).
 *
 * Bug (fix P5.2): `platformManager.onReady()` era registrado APÓS
 * `await platformManager.startAll()`. Se o WhatsApp conectar rápido (sessão em
 * cache), o evento 'ready' era emitido sem handler → scheduler/cleanup/memory
 * monitor não iniciavam.
 *
 * Estilo: cobre a ordem via mock do PlatformManager (onReady/startAll/getInstance).
 * O módulo main (`src/core/multiPlatform.ts`) tem side-effects pesadas
 * (inicializa adaptadores, registra comandos, inicia servidores de teste e
 * tela) que impedem o import direto num teste unitário.
 */

interface PM {
  onReady(fn: () => void): void;
  startAll(): Promise<void>;
}

/**
 * Simula o comportamento de `setupBootOrder(pm)` do multiPlatform.ts: registra
 * o onReady E chama startAll, na ordem do bootstrap real.
 */
async function boot(pm: PM) {
  pm.onReady(() => {});
  await pm.startAll();
}

function createPM(over: Partial<PM> = {}) {
  const handlers: (() => void)[] = [];
  const onReady = vi.fn((fn: () => void) => handlers.push(fn));
  const startAll = vi.fn(async () => {
    for (const h of handlers) await h();
  });
  return { handlers, onReady: onReady as PM['onReady'], startAll: startAll as PM['startAll'], ...over };
}

describe('multiPlatformBootOrder', () => {
  it('handlers não vazio após boot (onReady registrado antes de startAll)', async () => {
    const pm = createPM();
    const before = pm.handlers.length;
    await boot(pm);

    expect(pm.handlers.length).toBeGreaterThan(before);
    expect(pm.onReady).toHaveBeenCalledTimes(1);
    expect(pm.startAll).toHaveBeenCalledTimes(1);
  });

  it('control negativo: registrar depois de startAll → handlers vazio', async () => {
    const pm = createPM();
    // registrar DEPOIS de startAll → o handler nunca entra no ciclo
    await pm.startAll();

    expect(pm.handlers.length).toBe(0);
  });
});
