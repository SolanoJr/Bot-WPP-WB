import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock mínimo do whatsapp-web.js (MESMO padrão do whatsappAutoModDecoupling.test.ts, que passa na suite).
// NÃO mockar autoModService: deixar o getChat resolver rapidamente evita colisão de módulo com outros testes.
vi.mock('whatsapp-web.js', () => {
  class MockClient {
    info: any = { wid: { _serialized: '558581344211@c.us' }, pushname: 'Bot-WPP' };
    private listeners: Record<string, Function[]> = {};
    on(event: string, cb: Function) {
      (this.listeners[event] = this.listeners[event] || []).push(cb);
    }
    off(event: string, cb?: Function) {
      if (!cb) this.listeners[event] = [];
      else this.listeners[event] = (this.listeners[event] || []).filter((f) => f !== cb);
    }
    removeAllListeners(event?: string) {
      if (event) this.listeners[event] = [];
      else this.listeners = {};
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

describe('WhatsAppAdapter - despacho de $menu (regressão de messageHandler)', () => {
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

  it('deve invocar o messageHandler com texto $menu normalizado (handler registrado pelo PlatformManager)', async () => {
    const msg: any = {
      from: '202658048684056@lid',
      author: undefined,
      id: { _serialized: 'wpp:1', id: '1' },
      body: '$menu',
      type: 'chat',
      fromMe: false,
      getChat: () => Promise.resolve({ participants: [], id: { _serialized: '202658048684056@lid' } }),
      reply: vi.fn(),
    };

    innerClient.emit('message', msg);
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setTimeout(r, 20));

    expect(handledMessages.length).toBe(1);
    expect(handledMessages[0].text).toBe('$menu');
    expect(handledMessages[0].isCommand).toBe(false);
  });
});
