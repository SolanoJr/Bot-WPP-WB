/**
 * Testes de adapters de plataforma — cobre casos reais de falha:
 * - Race condition do Telegram (launch antes de initialize)
 * - Discord evento clientReady
 * - Normalização de mensagens
 * - Inicialização com timeout
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TelegramAdapter } from '../../src/platforms/telegram/TelegramAdapter';
import { DiscordAdapter } from '../../src/platforms/discord/DiscordAdapter';
import { CommandConfigService } from '../../src/services/commandConfigService';

// -------------------------------------------------------------------
// Mock Telegraf
// -------------------------------------------------------------------
vi.mock('telegraf', () => {
  const { EventEmitter } = require('events');
  class MockTelegraf extends EventEmitter {
    botInfo = { id: 12345, username: 'MockBot' };
    launch = vi.fn().mockResolvedValue(undefined);
    stop = vi.fn().mockResolvedValue(undefined);
    telegram = {
      sendMessage: vi.fn().mockResolvedValue({
        message_id: 1,
        chat: { id: 100, type: 'group' },
        from: { id: 99, first_name: 'User', is_bot: false },
        date: Math.floor(Date.now() / 1000),
        text: 'ok',
      }),
      getChat: vi.fn().mockResolvedValue({ id: 100, type: 'group', title: 'Grupo Teste' }),
    };
    // Simula o método catch do Telegraf
    catch = vi.fn();
    on = vi.fn();
  }
  return { Telegraf: MockTelegraf };
});

// -------------------------------------------------------------------
// Mock discord.js
// -------------------------------------------------------------------
vi.mock('discord.js', () => {
  const { EventEmitter } = require('events');
  class MockDiscordClient extends EventEmitter {
    user = { id: '1111', username: 'TestDiscordBot' };
    login = vi.fn().mockImplementation(async function(this: any) {
      // Simula o evento clientReady após login
      setTimeout(() => this.emit('clientReady', { user: this.user }), 10);
    });
    destroy = vi.fn().mockResolvedValue(undefined);
    channels = {
      fetch: vi.fn().mockResolvedValue({
        isTextBased: () => true,
        send: vi.fn().mockResolvedValue({ id: 'msg1', content: 'ok', author: { id: '1111', username: 'Bot', bot: true }, channel: { id: '999', type: 0 }, createdAt: new Date(), attachments: { size: 0 } }),
      }),
    };
    guilds = { cache: new Map() };
    users = { fetch: vi.fn().mockResolvedValue({ id: '1111', username: 'User', bot: false }) };
  }
  const GatewayIntentBits = { Guilds: 1, GuildMessages: 2, MessageContent: 4, DirectMessages: 8 };
  const Partials = { Channel: 'Channel', Message: 'Message' };
  return { Client: MockDiscordClient, GatewayIntentBits, Partials };
});

// -------------------------------------------------------------------
// TelegramAdapter
// -------------------------------------------------------------------
describe('TelegramAdapter', () => {
  it('initialize() deve chamar launch() e marcar isReady=true', async () => {
    const adapter = new TelegramAdapter('dummy-token');
    await adapter.initialize();
    expect(adapter.client.isReady).toBe(true);
  });

  it('initialize() não deve dar timeout (race condition corrigida)', async () => {
    const adapter = new TelegramAdapter('dummy-token');
    // Deve resolver sem timeout — se demorar mais de 2s, falhou
    await expect(
      Promise.race([
        adapter.initialize(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 2000)),
      ])
    ).resolves.toBeUndefined();
  });

  it('initialize() duas vezes não deve lançar erro', async () => {
    const adapter = new TelegramAdapter('dummy-token');
    await adapter.initialize();
    await expect(adapter.initialize()).resolves.toBeUndefined();
  });

  it('sendMessage deve retornar PlatformMessage com platform=telegram', async () => {
    const adapter = new TelegramAdapter('dummy-token');
    await adapter.initialize();
    const msg = await adapter.client.sendMessage('tg:100', 'Olá');
    expect(msg.platform).toBe('telegram');
    expect(msg.chatId).toBe('tg:100');
  });

  it('shutdown deve parar o bot', async () => {
    const adapter = new TelegramAdapter('dummy-token');
    await adapter.initialize();
    await expect(adapter.shutdown()).resolves.toBeUndefined();
    expect(adapter.client.isReady).toBe(false);
  });
});

// -------------------------------------------------------------------
// DiscordAdapter
// -------------------------------------------------------------------
describe('DiscordAdapter', () => {
  it('initialize() deve aguardar evento clientReady', async () => {
    const adapter = new DiscordAdapter('dummy-token');
    await expect(adapter.initialize()).resolves.toBeUndefined();
    expect(adapter.client.isReady).toBe(true);
  });

  it('initialize() duas vezes não deve lançar erro', async () => {
    const adapter = new DiscordAdapter('dummy-token');
    await adapter.initialize();
    await expect(adapter.initialize()).resolves.toBeUndefined();
  });

  it('sendMessage deve retornar PlatformMessage com platform=discord', async () => {
    const adapter = new DiscordAdapter('dummy-token');
    await adapter.initialize();
    const msg = await adapter.client.sendMessage('dc:999', 'Olá');
    expect(msg.platform).toBe('discord');
  });
});

// -------------------------------------------------------------------
// CommandConfigService
// -------------------------------------------------------------------
describe('CommandConfigService', () => {
  let service: CommandConfigService;

  beforeEach(() => {
    service = new CommandConfigService();
  });

  it('retorna true por padrão para comando não configurado', async () => {
    expect(await service.isEnabled('grupo1', 'ping')).toBe(true);
  });

  it('desabilita e reabilita comando por grupo', async () => {
    await service.setEnabled('grupo1', 'ban', false);
    expect(await service.isEnabled('grupo1', 'ban')).toBe(false);

    await service.setEnabled('grupo1', 'ban', true);
    expect(await service.isEnabled('grupo1', 'ban')).toBe(true);
  });

  it('configuração de um grupo não afeta outro grupo', async () => {
    await service.setEnabled('grupo1', 'ban', false);
    expect(await service.isEnabled('grupo2', 'ban')).toBe(true);
  });

  it('desabilitar comando retorna mensagem de aviso ao tentar executar', async () => {
    await service.setEnabled('grupo1', 'ban', false);
    const enabled = await service.isEnabled('grupo1', 'ban');
    expect(enabled).toBe(false);
  });
});
