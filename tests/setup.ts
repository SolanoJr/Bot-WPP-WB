import { vi } from 'vitest';
import 'dotenv/config';

// Set required env vars for tests
process.env.TELEGRAM_BOT_TOKEN = 'test-telegram-token';
process.env.DISCORD_BOT_TOKEN = 'test-discord-token';
process.env.GEMINI_API_KEY = 'test-gemini-api-key';
process.env.WARRIOR_AUTH_KEY = '1234567890123456';
process.env.COMMAND_PREFIX = '$';
process.env.RELAY_URL = 'http://relay.test';
process.env.MASTER_USER = 'masterUser';

// Mock telegraf
vi.mock('telegraf', () => {
  const mockLaunch = vi.fn().mockResolvedValue(Promise.resolve());
  const mockCatch = vi.fn();
  const mockOn = vi.fn();
  const mockTelegram = {
    launch: mockLaunch,
    catch: mockCatch,
    on: mockOn,
    botInfo: { id: '123', username: 'test' },
  };
  const MockTelegraf = vi.fn(() => ({
    launch: mockLaunch,
    catch: mockCatch,
    on: mockOn,
    telegram: mockTelegram,
    botInfo: mockTelegram.botInfo,
  }));
  return { Telegraf: MockTelegraf };
});

// Mock discord.js
vi.mock('discord.js', () => {
  const mockIntents = {
    FLAGS: {
      GUILDS: 'Guilds',
      GUILD_MESSAGES: 'GuildMessages',
      GUILD_MESSAGE_REACTIONS: 'GuildMessageReactions',
    },
  };
  const mockClient = {
    user: { id: '1111', username: 'TestDiscordBot' },
    login: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn().mockResolvedValue(undefined),
    channels: {
      fetch: vi.fn().mockResolvedValue({
        send: vi.fn().mockResolvedValue({ id: 'msg1', content: 'ok' }),
      }),
    },
  };
  return {
    Client: vi.fn(() => mockClient),
    Intents: mockIntents,
  };
});

// Mock lowdb
vi.mock('lowdb', () => {
  const mockAdapter = {
    read: vi.fn().mockResolvedValue(undefined),
    write: vi.fn().mockResolvedValue(undefined),
    data: {},
  };
  return {
    JSONFile: vi.fn(() => mockAdapter),
    Low: vi.fn(() => mockAdapter),
  };
});