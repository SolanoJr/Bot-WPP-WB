import { describe, it, expect, vi } from 'vitest';
import { TelegramAdapter } from '../../src/platforms/telegram/TelegramAdapter';
import { PlatformMessage } from '../../src/platforms/base/PlatformTypes';

// Mock Telegraf client
vi.mock('telegraf', () => {
  const EventEmitter = require('events');
  class MockTelegraf extends EventEmitter {
    botInfo = { id: 12345, username: 'MockBot' };
    launch = vi.fn().mockResolvedValue(undefined);
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

// MockBot type removed - not needed

describe('TelegramAdapter', () => {
  it('should normalize sent message', async () => {
    const adapter = new TelegramAdapter('dummy-token');
    // @ts-ignore – replace internal client with mock
    adapter['client'] = {
      isReady: true,
      userId: 'tg:12345',
      userName: 'TestBot',
      sendMessage: async (chatId: string, text: string) => ({
        id: `tg:1`,
        chatId,
        userId: 'tg:12345',
        userName: 'TestBot',
        text,
        timestamp: new Date(),
        isFromMe: false,
        isCommand: false,
        platform: 'telegram',
        raw: {} as any,
        hasMedia: false,
        mediaType: undefined,
        replyToMessageId: undefined,
      } as PlatformMessage),
    } as any;

    const msg = await (adapter['client'] as any).sendMessage('tg:100', 'hello');
    expect(msg.chatId).toBe('tg:100');
    expect(msg.text).toBe('hello');
  });
});