import { vi } from 'vitest';

// vi.mock() é hoisted — usar require() dentro das factories, não imports ES

vi.mock('dotenv', () => ({
  default: { config: vi.fn().mockReturnValue({ parsed: {} }) },
  config: vi.fn().mockReturnValue({ parsed: {} }),
}));

vi.mock('dotenv/config', () => ({}));

vi.mock('telegraf', () => {
  const EventEmitter = require('node:events').EventEmitter;
  class MockTelegraf extends EventEmitter {
    constructor() {
      super();
      this.botInfo = { id: 12345, username: 'MockBot' };
      this.launch = vi.fn().mockResolvedValue(undefined);
      this.stop = vi.fn().mockResolvedValue(undefined);
      this.catch = vi.fn();
      this.on = vi.fn();
      this.telegram = {
        sendMessage: vi.fn().mockResolvedValue({
          message_id: 1,
          chat: { id: 100, type: 'group' },
          from: { id: 99, first_name: 'User', is_bot: false },
          date: Math.floor(Date.now() / 1000),
          text: 'ok',
        }),
        getChat: vi.fn().mockResolvedValue({ id: 100, type: 'group', title: 'Grupo Teste' }),
      };
    }
  }
  return { Telegraf: MockTelegraf };
});

vi.mock('discord.js', () => {
  const EventEmitter = require('node:events').EventEmitter;
  class MockDiscordClient extends EventEmitter {
    constructor() {
      super();
      this.user = { id: '1111', username: 'TestDiscordBot' };
      this.destroy = vi.fn().mockResolvedValue(undefined);
      this.guilds = { cache: new Map() };
      this.users = { fetch: vi.fn().mockResolvedValue({ id: '1111', username: 'User', bot: false }) };
      this.channels = {
        fetch: vi.fn().mockResolvedValue({
          isTextBased: () => true,
          send: vi.fn().mockResolvedValue({
            id: 'msg1', content: 'ok',
            author: { id: '1111', username: 'Bot', bot: true },
            channel: { id: '999', type: 0 },
            createdAt: new Date(),
            attachments: { size: 0 },
          }),
        }),
      };
      const self = this;
      this.login = vi.fn().mockImplementation(() => {
        return new Promise((resolve) => {
          setTimeout(() => { self.emit('clientReady', { user: self.user }); resolve(undefined); }, 10);
        });
      });
    }
  }
  return {
    Client: MockDiscordClient,
    GatewayIntentBits: { Guilds: 1, GuildMessages: 2, MessageContent: 4, DirectMessages: 8 },
    Partials: { Channel: 'Channel', Message: 'Message' },
  };
});

vi.mock('lowdb', () => ({
  JSONFile: vi.fn(() => ({ read: vi.fn().mockResolvedValue(undefined), write: vi.fn().mockResolvedValue(undefined), data: {} })),
  Low: vi.fn(() => ({ data: {}, read: vi.fn().mockResolvedValue(undefined), write: vi.fn().mockResolvedValue(undefined) })),
}));

vi.mock('whatsapp-web.js', () => ({
  Client: vi.fn(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    once: vi.fn(),
    sendMessage: vi.fn().mockResolvedValue({}),
    getChatById: vi.fn().mockResolvedValue({ id: { _serialized: 'chat1' }, isGroup: true, participants: [] }),
    getContactById: vi.fn().mockResolvedValue({ id: { _serialized: 'user1' }, pushname: 'User' }),
    getChats: vi.fn().mockResolvedValue([]),
    info: { wid: { _serialized: '558581344211@c.us' }, pushname: 'Bot' },
  })),
  LocalAuth: vi.fn(),
  MessageMedia: { fromUrl: vi.fn().mockResolvedValue({}) },
}));
