import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock mínimo do whatsapp-web.js: Client com on/emit manuais (sem require de events).
vi.mock('whatsapp-web.js', () => {
  class MockClient {
    info: any = { wid: { _serialized: '558581344211@c.us' }, pushname: 'Bot-WPP' };
    private listeners: Record<string, Function[]> = {};
    on(event: string, cb: Function) {
      (this.listeners[event] = this.listeners[event] || []).push(cb);
    }
    emit(event: string, ...args: any[]) {
      (this.listeners[event] || []).forEach((cb) => cb(...args));
    }
    async initialize() {}
    async destroy() {}
  }
  return {
    Client: MockClient,
    LocalAuth: class { constructor(_o?: any) {} },
    MessageMedia: class {},
  };
});

vi.mock('qrcode', () => ({ generate: vi.fn() }));

import { WhatsAppAdapter } from '../../src/platforms/whatsapp/WhatsAppAdapter';

describe('WhatsAppAdapter - desacoplamento do AutoMod (caminho crítico de comandos)', () => {
  let adapter: any;
  let innerClient: any;
  let handledMessages: any[];

  beforeEach(() => {
    handledMessages = [];
    // @ts-ignore - construtor cria Client mockado
    adapter = new WhatsAppAdapter();
    innerClient = adapter['innerClient'] as any;
    // Registra o messageHandler (equivalente a PlatformManager.setupAdapterHandlers)
    adapter.onMessage(async (platformMsg: any) => {
      handledMessages.push(platformMsg);
    });
  });

  it('deve despachar o comando mesmo quando processAutoMod pendura (getChat nunca resolve)', async () => {
    const pendingPromise = new Promise<any>(() => {}); // nunca resolve, nunca rejeita
    const msg: any = {
      from: '202658048684056@lid',
      author: undefined,
      id: { _serialized: 'wpp:1', id: '1' },
      body: '$menu',
      type: 'chat',
      fromMe: false,
      getChat: () => pendingPromise,
      reply: vi.fn(),
    };

    innerClient.emit('message', msg);

    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setTimeout(r, 20));

    expect(handledMessages.length).toBe(1);
    expect(handledMessages[0].text).toBe('$menu');
    expect(handledMessages[0].isCommand).toBe(false);
  });

  it('deve despachar comando mesmo quando processAutoMod lança exceção', async () => {
    const msg: any = {
      from: '202658048684056@lid',
      author: undefined,
      id: { _serialized: 'wpp:2', id: '2' },
      body: '$menu',
      type: 'chat',
      fromMe: false,
      getChat: () => Promise.reject(new Error('simulated AutoMod failure')),
      reply: vi.fn(),
    };

    innerClient.emit('message', msg);
    await new Promise((r) => setTimeout(r, 20));

    expect(handledMessages.length).toBe(1);
    expect(handledMessages[0].text).toBe('$menu');
  });
});
