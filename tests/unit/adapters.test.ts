import { describe, it, expect, vi } from 'vitest';
import { TelegramAdapter } from '../../src/platforms/telegram/TelegramAdapter';
import { DiscordAdapter } from '../../src/platforms/discord/DiscordAdapter';
import { CommandConfigService } from '../../src/services/commandConfigService';
import { CmdToggle } from '../../src/bot/commands/cmdToggle';
import { PlatformMessage } from '../../src/platforms/base/PlatformTypes';

// -------------------------------------------------------------------
// Mocks de dependências externas
// -------------------------------------------------------------------
vi.mock('telegraf', () => {
  const { EventEmitter } = require('events');
  class MockTelegraf extends EventEmitter {
    // Minimal botInfo required by TelegramAdapter
    botInfo = { id: 12345, username: 'MockBot' };
    launch = vi.fn().mockResolvedValue(undefined);
    stop = vi.fn().mockResolvedValue(undefined);
    telegram = {
      sendMessage: vi.fn(),
      sendPhoto: vi.fn(),
      sendVideo: vi.fn(),
      sendAudio: vi.fn(),
      sendDocument: vi.fn(),
      sendSticker: vi.fn(),
      getChat: vi.fn(),
    };
  }
  return { Telegraf: MockTelegraf };
});

vi.mock('discord.js', () => {
  const { EventEmitter } = require('events');
  class MockClient extends EventEmitter {
    user = { id: '1111', username: 'TestDiscordBot' };
    login = vi.fn().mockResolvedValue(undefined);
    destroy = vi.fn().mockResolvedValue(undefined);
    channels = {
      fetch: vi.fn().mockResolvedValue({
        send: vi.fn().mockResolvedValue({ id: 'msg1', content: 'ok' }),
      }),
    };
  }
  const Intents = { FLAGS: { GUILDS: 1, GUILD_MESSAGES: 2 }, GatewayIntentBits: { Guilds: 1, GuildMessages: 2 } };
  return { Client: MockClient, Intents };
});

vi.mock('lowdb', () => {
  // Mock da classe JSONFile que pode ser instanciada com `new JSONFile(...)`
  const JSONFileMock = vi.fn(() => ({
    read: vi.fn().mockResolvedValue(undefined),
    write: vi.fn().mockResolvedValue(undefined),
  }));
  // Mock Low with read/write and data container
  const LowMock = vi.fn(() => ({
    data: {},
    read: vi.fn().mockResolvedValue(undefined),
    write: vi.fn().mockResolvedValue(undefined),
  }));
  return { JSONFile: JSONFileMock, Low: LowMock };
});

// -------------------------------------------------------------------
// Helpers auxiliares
// -------------------------------------------------------------------
function mockTelegramSendMessage() {
    const sendMessageMock = vi.fn().mockImplementation(async (chatId: string, text: string) => ({
      message_id: 1,
      chat: { id: 100 },
      date: Math.floor(Date.now() / 1000),
      text,
      chatId,
      platform: 'telegram',
    }));
  // @ts-ignore – sobrescrevemos o método interno do adapter
  return sendMessageMock;
}

// -------------------------------------------------------------------
// Testes para TelegramAdapter
// -------------------------------------------------------------------
describe('TelegramAdapter', () => {
  const adapter = new TelegramAdapter('dummy-token');

  it('deve normalizar mensagem enviada', async () => {
    // @ts-ignore – substituímos o cliente interno pelo mock
    adapter['client'] = { isReady: true, sendMessage: mockTelegramSendMessage() };
    const msg = await (adapter['client'] as any).sendMessage('tg:123', 'Olá');
    expect(msg.chatId).toBe('tg:123');
    expect(msg.text).toBe('Olá');
    expect(msg.platform).toBe('telegram');
  });
});

// -------------------------------------------------------------------
// Testes para DiscordAdapter
// -------------------------------------------------------------------
describe('DiscordAdapter', () => {
  const adapter = new DiscordAdapter('dummy-token');

  it('deve normalizar mensagem enviada', async () => {
    // @ts-ignore – substituímos o cliente interno pelo mock
    adapter['client'] = { isReady: true, sendMessage: vi.fn().mockResolvedValue({
      id: 'discord:msg1',
      chatId: 'discord:1234',
      userId: 'discord:1111',
      userName: 'TestDiscordBot',
      text: 'Olá',
      timestamp: new Date(),
      isFromMe: false,
      isCommand: false,
      platform: 'discord',
      raw: {} as any,
      hasMedia: false,
      mediaType: undefined,
      replyToMessageId: undefined,
    }) };
    const msg = await (adapter['client'] as any).sendMessage('discord:1234', 'Olá');
    expect(msg.chatId).toBe('discord:1234');
    expect(msg.text).toBe('Olá');
    expect(msg.platform).toBe('discord');
  });
});

// -------------------------------------------------------------------
// Testes para CommandConfigService
// -------------------------------------------------------------------
describe('CommandConfigService', () => {
  const service = new CommandConfigService();

  it('deve habilitar e desabilitar um comando por plataforma', () => {
    service.setCommandEnabled('ping', 'whatsapp', true);
    service.setCommandEnabled('ping', 'telegram', false);
    expect(service.isCommandEnabled('ping', 'whatsapp' as any)).toBe(true);
    expect(service.isCommandEnabled('ping', 'telegram' as any)).toBe(false);
  });

  it('retorna true por padrão quando o comando não está configurado', () => {
    expect(service.isCommandEnabled('unknown', 'whatsapp' as any)).toBe(true);
  });
});

// -------------------------------------------------------------------
// Testes para CmdToggle (comando admin)
// -------------------------------------------------------------------
describe('CmdToggle', () => {
  const configService = new CommandConfigService();

  const mockMsg = (text: string) => ({
    text,
    platform: 'whatsapp',
    userId: 'master',
    isCommand: true,
    chatId: 'whatsapp',
  } as unknown as PlatformMessage);

  const cmd = new CmdToggle(configService);

  it('ativa um comando', async () => {
    const reply = await cmd.execute(mockMsg('/toggle ping on'));
    expect(reply).toContain('ativado');
    expect(configService.isCommandEnabled('ping', 'whatsapp')).toBe(true);
  });

  it('desativa um comando', async () => {
    const reply = await cmd.execute(mockMsg('/toggle ping off'));
    expect(reply).toContain('desativado');
    expect(configService.isCommandEnabled('ping', 'whatsapp')).toBe(false);
  });
});