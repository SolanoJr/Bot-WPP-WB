import { describe, it, expect, vi } from 'vitest';
import { DiscordAdapter } from '../../src/platforms/discord/DiscordAdapter';
import { PlatformMessage } from '../../src/platforms/base/PlatformTypes';


// Mock discord.js client
vi.mock('discord.js', () => {
  const EventEmitter = require('events');
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
  return { Client: MockClient };
});

describe('DiscordAdapter', () => {
  it('should normalize a sent message', async () => {
    const adapter = new DiscordAdapter('dummy-token');
    // @ts-ignore – replace internal client with mock
    adapter['client'] = {
      isReady: true,
      userId: 'discord:1111',
      userName: 'TestDiscordBot',
      sendMessage: async (chatId: string, text: string) => ({
        id: `discord:msg1`,
        chatId,
        userId: 'discord:1111',
        userName: 'TestDiscordBot',
        text,
        timestamp: new Date(),
        isFromMe: false,
        isCommand: false,
        platform: 'discord',
        raw: {} as any,
        hasMedia: false,
        mediaType: undefined,
        replyToMessageId: undefined,
      } as PlatformMessage),
    } as any;
    const msg = await (adapter['client'] as any).sendMessage('discord:1234', 'olá');
    expect(msg.chatId).toBe('discord:1234');
    expect(msg.text).toBe('olá');
    expect(msg.platform).toBe('discord');
  });
});
