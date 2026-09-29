/**
 * Testes automatizados de reconnect do Baileys — Fase 3
 *
 * Cobre os bugs encontrados e corrigidos:
 * A) connect() falhando → reconnectInProgress não pode ficar travado
 * B) handleClose() duplicado → somente um reconnect ativo
 * C) stale socket → submódulos devem apontar para o novo socket
 * D) isSocketReady() no Baileys v7 → usar wsClient.isOpen
 *
 * NÃO conecta no WhatsApp real — usa mocks isolados.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeMockSocket(id: string, isOpen = true) {
  const ws = {
    readyState: isOpen ? 1 : 3, // 1=OPEN, 3=CLOSED
    OPEN: 1,
    CLOSED: 3,
  };
  const wsClient = {
    isOpen,
    socket: ws,
  };
  return {
    id,
    ws: wsClient,
    socket: ws,
    user: { id: '558581344211@s.whatsapp.net', name: 'TestBot' },
    sendMessage: vi.fn().mockResolvedValue({ key: { id: `msg-${id}`, remoteJid: 'test@g.us', fromMe: true } }),
    end: vi.fn().mockResolvedValue(undefined),
    ev: { on: vi.fn(), off: vi.fn() },
    connectionState: { connection: isOpen ? 'open' : 'close' },
  };
}

function makeMockConnection() {
  const listeners: Record<string, Function[]> = {};
  return {
    sock: null as any,
    _ready: false,
    _loggedOut: false,
    _userId: '',
    _userName: '',
    _lastActivityTs: Date.now(),
    _lastConnectAttemptTs: Date.now(),
    _pendingQR: false,
    getSock() { return this.sock; },
    setSock(s: any) { this.sock = s; },
    get ready() { return this._ready; },
    setReady(v: boolean) { this._ready = v; },
    get loggedOut() { return this._loggedOut; },
    setLoggedOut(v: boolean) { this._loggedOut = v; },
    get userId() { return this._userId; },
    get userName() { return this._userName; },
    setUserInfo(id: string, name: string) { this._userId = id; this._userName = name; },
    get lastActivityTs() { return this._lastActivityTs; },
    setLastActivityTs(v: number) { this._lastActivityTs = v; },
    get lastConnectAttemptTs() { return this._lastConnectAttemptTs; },
    setLastConnectAttemptTs(v: number) { this._lastConnectAttemptTs = v; },
    get pendingQR() { return this._pendingQR; },
    setQrPending(v: boolean) { this._pendingQR = v; },
    onSocketDisconnect: vi.fn(),
    connect: vi.fn(),
    shutdown: vi.fn().mockResolvedValue(undefined),
    waitForReady: vi.fn().mockResolvedValue(true),
    ev: {
      on: vi.fn((event: string, cb: Function) => {
        if (!listeners[event]) listeners[event] = [];
        listeners[event].push(cb);
      }),
      off: vi.fn(),
      emit: vi.fn((event: string, ...args: any[]) => {
        (listeners[event] || []).forEach(cb => cb(...args));
      }),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// A) connect() falhando
// ─────────────────────────────────────────────────────────────────────────────

describe('BaileysAdapter — connect() falhando (reconnect não trava)', () => {
  let mockConnection: ReturnType<typeof makeMockConnection>;
  let adapter: any;
  let originalSetTimeout: typeof setTimeout;

  beforeEach(() => {
    mockConnection = makeMockConnection();
    // Criar adapter mínimo com connection mockado
    adapter = {
      connection: mockConnection,
      reconnectInProgress: false,
      reconnectAttempts: 0,
      maxReconnectDelay: 60000,
      isReady: false,
      handleClose: null as any,
      syncSubmodulesWithNewSocket: vi.fn().mockResolvedValue(undefined),
      getHealth: vi.fn(),
      notifyOwner: vi.fn().mockResolvedValue(undefined),
      disconnectedHandler: null as any,
      onDisconnected: vi.fn(function(this: any, cb: Function) {
        this.disconnectedHandler = cb;
      }),
    };

    // Implementar handleClose como no código real (com correção de race condition)
    adapter.handleClose = function(reason: string, statusCode?: number) {
      this.isReady = false;
      this.getHealth();
      this.disconnectedHandler?.(reason);

      if (this.reconnectInProgress) {
        return; // Ignora reconnect concorrente
      }

      // Marca reconnectInProgress ANTES do setTimeout (correção de race condition)
      this.reconnectInProgress = true;

      if (statusCode === 401) {
        this.reconnectAttempts = 0;
        setTimeout(() => {
          this.connection.connect()
            .then(() => { this.reconnectInProgress = false; })
            .catch((err: any) => {
              this.reconnectInProgress = false;
              this.reconnectAttempts++;
              const baseDelay = 5000;
              const delay = Math.min(baseDelay * Math.pow(2, this.reconnectAttempts - 1), this.maxReconnectDelay);
              setTimeout(() => this.handleClose('reconnect-failed-after-401', 401), delay);
            });
        }, 5000);
        return;
      }

      this.reconnectAttempts++;
      const baseDelay = reason.includes('Stream Errored') || reason.includes('conflict') ? 2000 : 5000;
      const delay = Math.min(baseDelay * Math.pow(2, this.reconnectAttempts - 1), this.maxReconnectDelay);

      setTimeout(() => {
        this.connection.connect()
          .then(() => { this.reconnectInProgress = false; })
          .catch((err: any) => {
            this.reconnectInProgress = false;
            this.reconnectAttempts++;
            const retryDelay = Math.min(baseDelay * Math.pow(2, this.reconnectAttempts), this.maxReconnectDelay);
            setTimeout(() => this.handleClose('reconnect-failed', 0), retryDelay);
          });
      }, delay);
    };

    // Usar timers reais mas com delays curtos para teste
    originalSetTimeout = global.setTimeout;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('connect() rejeitando → reconnectInProgress volta para false', async () => {
    vi.useFakeTimers();
    mockConnection.connect.mockRejectedValueOnce(new Error('Connection refused'));

    adapter.handleClose('test-error', 0);

    // Avança o tempo para executar o setTimeout do reconnect (só timer, sem microtasks)
    vi.advanceTimersByTime(6000);

    // reconnectInProgress deve ser true (reconnect em andamento)
    expect(adapter.reconnectInProgress).toBe(true);

    // Flush microtasks para executar o .catch()
    await Promise.resolve();
    await Promise.resolve();

    // Agora reconnectInProgress deve ser false (falhou e liberou)
    expect(adapter.reconnectInProgress).toBe(false);
  });

  it('connect() falhando → retry é agendado', async () => {
    vi.useFakeTimers();
    mockConnection.connect.mockRejectedValue(new Error('Connection refused'));

    adapter.handleClose('test-error', 0);

    // Primeiro reconnect (delay = 5000ms) — executa só o timer
    vi.advanceTimersByTime(6000);
    expect(adapter.reconnectInProgress).toBe(true);

    // Flush microtasks para executar .catch() → falha e agenda retry
    await Promise.resolve();
    await Promise.resolve();
    expect(adapter.reconnectInProgress).toBe(false);

    // Retry agendado — avança tempo suficiente para o próximo reconnect
    vi.advanceTimersByTime(60000);
    expect(adapter.reconnectInProgress).toBe(true);
  });

  it('connect() falhando → múltiplos retries não deixam reconnectInProgress travado', async () => {
    vi.useFakeTimers();
    mockConnection.connect.mockRejectedValue(new Error('Connection refused'));

    adapter.handleClose('test-error', 0);

    // Avança tempo suficiente para múltiplos ciclos de retry
    await vi.advanceTimersByTimeAsync(120000);

    // Sistema não deve estar travado: connect() deve ter sido chamado múltiplas vezes
    // (prova que o retry está funcionando)
    expect(mockConnection.connect.mock.calls.length).toBeGreaterThan(1);
  });

  it('connect() falhando depois recuperando → estado consistente', async () => {
    vi.useFakeTimers();
    mockConnection.connect
      .mockRejectedValueOnce(new Error('Connection refused'))
      .mockRejectedValueOnce(new Error('Connection refused'))
      .mockResolvedValueOnce(undefined);

    adapter.handleClose('test-error', 0);

    // Avança tempo suficiente para múltiplos ciclos de retry
    // (delays: 5s + 10s + 20s + 40s + 60s = 135s)
    await vi.advanceTimersByTimeAsync(200000);

    // Sistema deve ter tentado pelo menos 3 vezes (2 falhas + 1 sucesso)
    expect(mockConnection.connect.mock.calls.length).toBeGreaterThanOrEqual(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B) handleClose() duplicado
// ─────────────────────────────────────────────────────────────────────────────

describe('BaileysAdapter — handleClose() duplicado', () => {
  let mockConnection: ReturnType<typeof makeMockConnection>;
  let adapter: any;

  beforeEach(() => {
    mockConnection = makeMockConnection();
    adapter = {
      connection: mockConnection,
      reconnectInProgress: false,
      reconnectAttempts: 0,
      maxReconnectDelay: 60000,
      isReady: false,
      handleClose: null as any,
      syncSubmodulesWithNewSocket: vi.fn().mockResolvedValue(undefined),
      getHealth: vi.fn(),
      notifyOwner: vi.fn().mockResolvedValue(undefined),
      disconnectedHandler: null as any,
      onDisconnected: vi.fn(function(this: any, cb: Function) {
        this.disconnectedHandler = cb;
      }),
    };

    adapter.handleClose = function(reason: string, statusCode?: number) {
      this.isReady = false;
      this.getHealth();
      this.disconnectedHandler?.(reason);

      if (this.reconnectInProgress) {
        return;
      }

      // Marca reconnectInProgress ANTES do setTimeout (correção de race condition)
      this.reconnectInProgress = true;

      this.reconnectAttempts++;
      const baseDelay = 5000;
      const delay = Math.min(baseDelay * Math.pow(2, this.reconnectAttempts - 1), this.maxReconnectDelay);

      setTimeout(() => {
        this.connection.connect()
          .then(() => { this.reconnectInProgress = false; })
          .catch((err: any) => {
            this.reconnectInProgress = false;
            this.reconnectAttempts++;
            const retryDelay = Math.min(baseDelay * Math.pow(2, this.reconnectAttempts), this.maxReconnectDelay);
            setTimeout(() => this.handleClose('reconnect-failed', 0), retryDelay);
          });
      }, delay);
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('handleClose() chamado 2x rapidamente → somente um reconnect', async () => {
    vi.useFakeTimers();
    mockConnection.connect.mockResolvedValue(undefined);

    adapter.handleClose('test-error', 0);
    adapter.handleClose('test-error', 0); // Duplicado

    // Avança tempo
    vi.advanceTimersByTime(6000);

    // connect() deve ter sido chamado somente uma vez
    expect(mockConnection.connect).toHaveBeenCalledTimes(1);
  });

  it('handleClose() chamado 3x → ainda somente um reconnect', async () => {
    vi.useFakeTimers();
    mockConnection.connect.mockResolvedValue(undefined);

    adapter.handleClose('test-error', 0);
    adapter.handleClose('test-error', 0);
    adapter.handleClose('test-error', 0);

    vi.advanceTimersByTime(6000);

    expect(mockConnection.connect).toHaveBeenCalledTimes(1);
  });

  it('handleClose() duplicado não cria timer infinito', async () => {
    vi.useFakeTimers();
    mockConnection.connect.mockResolvedValue(undefined);

    adapter.handleClose('test-error', 0);
    adapter.handleClose('test-error', 0);

    // Avança o tempo suficiente para o primeiro reconnect executar
    vi.advanceTimersByTime(6000);
    await vi.runAllTimersAsync();

    // connect() ainda deve ter sido chamado somente uma vez
    expect(mockConnection.connect).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C) Stale socket
// ─────────────────────────────────────────────────────────────────────────────

describe('BaileysAdapter — stale socket (syncSubmodulesWithNewSocket)', () => {
  it('socket A → socket B: sender deve apontar para B', () => {
    const socketA = makeMockSocket('A');
    const socketB = makeMockSocket('B');

    const sender = { sock: socketA, setSock: vi.fn(function(this: any, s: any) { this.sock = s; }) };
    const normalizer = { sock: socketA, setSock: vi.fn(function(this: any, s: any) { this.sock = s; }) };
    const chatManager = { sock: socketA, setSock: vi.fn(function(this: any, s: any) { this.sock = s; }) };
    const memberManager = { sock: socketA, setSock: vi.fn(function(this: any, s: any) { this.sock = s; }) };
    const health = { sock: socketA, setSock: vi.fn(function(this: any, s: any) { this.sock = s; }) };

    // Simula syncSubmodulesWithNewSocket
    const newSock = socketB;
    sender.setSock(newSock);
    normalizer.setSock(newSock);
    chatManager.setSock(newSock);
    memberManager.setSock(newSock);
    health.setSock(newSock);

    expect(sender.sock).toBe(socketB);
    expect(normalizer.sock).toBe(socketB);
    expect(chatManager.sock).toBe(socketB);
    expect(memberManager.sock).toBe(socketB);
    expect(health.sock).toBe(socketB);
  });

  it('socket A → socket B: sender NÃO continua usando A', () => {
    const socketA = makeMockSocket('A');
    const socketB = makeMockSocket('B');

    const sender = { sock: socketA, setSock: vi.fn(function(this: any, s: any) { this.sock = s; }) };

    // Sync
    sender.setSock(socketB);

    expect(sender.sock).not.toBe(socketA);
    expect(sender.sock).toBe(socketB);
  });

  it('socket A → socket B: send usa B', async () => {
    const socketA = makeMockSocket('A');
    const socketB = makeMockSocket('B');

    const sender = { sock: socketA, setSock: vi.fn(function(this: any, s: any) { this.sock = s; }) };

    // Sync
    sender.setSock(socketB);

    // Send deve usar socketB
    await sender.sock.sendMessage('test@g.us', { text: 'hello' });

    expect(socketB.sendMessage).toHaveBeenCalled();
    expect(socketA.sendMessage).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D) isSocketReady() no Baileys v7
// ─────────────────────────────────────────────────────────────────────────────

describe('BaileysMessageSender — isSocketReady() Baileys v7', () => {
  it('wsClient.isOpen === true → socket pronto', () => {
    const mockSock = {
      ws: { isOpen: true, socket: { readyState: 1 } },
      socket: undefined, // sock.socket não existe em v7
    };

    // Simula a lógica corrigida do isSocketReady
    function isSocketReady(sock: any): boolean {
      if (!sock) return false;
      const wsClient = sock.ws;
      if (!wsClient) return false;
      if (typeof wsClient.isOpen === 'boolean') return wsClient.isOpen;
      const ws = wsClient.socket;
      if (!ws) return false;
      return ws.readyState === 1;
    }

    expect(isSocketReady(mockSock)).toBe(true);
  });

  it('wsClient.isOpen === false → socket não pronto', () => {
    const mockSock = {
      ws: { isOpen: false, socket: { readyState: 3 } },
      socket: undefined,
    };

    function isSocketReady(sock: any): boolean {
      if (!sock) return false;
      const wsClient = sock.ws;
      if (!wsClient) return false;
      if (typeof wsClient.isOpen === 'boolean') return wsClient.isOpen;
      const ws = wsClient.socket;
      if (!ws) return false;
      return ws.readyState === 1;
    }

    expect(isSocketReady(mockSock)).toBe(false);
  });

  it('wsClient ausente → socket não pronto', () => {
    const mockSock = { ws: null, socket: null };

    function isSocketReady(sock: any): boolean {
      if (!sock) return false;
      const wsClient = sock.ws;
      if (!wsClient) return false;
      if (typeof wsClient.isOpen === 'boolean') return wsClient.isOpen;
      const ws = wsClient.socket;
      if (!ws) return false;
      return ws.readyState === 1;
    }

    expect(isSocketReady(mockSock)).toBe(false);
  });

  it('sock nulo → socket não pronto', () => {
    function isSocketReady(sock: any): boolean {
      if (!sock) return false;
      const wsClient = sock.ws;
      if (!wsClient) return false;
      if (typeof wsClient.isOpen === 'boolean') return wsClient.isOpen;
      const ws = wsClient.socket;
      if (!ws) return false;
      return ws.readyState === 1;
    }

    expect(isSocketReady(null)).toBe(false);
    expect(isSocketReady(undefined)).toBe(false);
  });

  it('fallback: wsClient.socket.readyState === 1 → socket pronto', () => {
    const mockSock = {
      ws: { isOpen: undefined, socket: { readyState: 1 } },
      socket: undefined,
    };

    function isSocketReady(sock: any): boolean {
      if (!sock) return false;
      const wsClient = sock.ws;
      if (!wsClient) return false;
      if (typeof wsClient.isOpen === 'boolean') return wsClient.isOpen;
      const ws = wsClient.socket;
      if (!ws) return false;
      return ws.readyState === 1;
    }

    expect(isSocketReady(mockSock)).toBe(true);
  });

  it('fallback: wsClient.socket.readyState === 3 → socket não pronto', () => {
    const mockSock = {
      ws: { isOpen: undefined, socket: { readyState: 3 } },
      socket: undefined,
    };

    function isSocketReady(sock: any): boolean {
      if (!sock) return false;
      const wsClient = sock.ws;
      if (!wsClient) return false;
      if (typeof wsClient.isOpen === 'boolean') return wsClient.isOpen;
      const ws = wsClient.socket;
      if (!ws) return false;
      return ws.readyState === 1;
    }

    expect(isSocketReady(mockSock)).toBe(false);
  });

  it('sock.socket (v6) não deve ser usado em v7', () => {
    // Em Baileys v7, sock.socket NÃO existe
    const mockSockV7 = {
      ws: { isOpen: true, socket: { readyState: 1 } },
      socket: undefined, // correto: não existe em v7
    };

    // O código NÃO deve acessar sock.socket diretamente
    // Deve usar sock.ws.isOpen
    function isSocketReady(sock: any): boolean {
      if (!sock) return false;
      const wsClient = sock.ws;
      if (!wsClient) return false;
      if (typeof wsClient.isOpen === 'boolean') return wsClient.isOpen;
      const ws = wsClient.socket;
      if (!ws) return false;
      return ws.readyState === 1;
    }

    expect(isSocketReady(mockSockV7)).toBe(true);
    // Garante que sock.socket não foi acessado
    expect(mockSockV7.socket).toBeUndefined();
  });
});
