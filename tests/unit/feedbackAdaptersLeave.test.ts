/**
 * INC-024 — handlers de leave nos adapters Telegram e Discord.
 *
 * Prova que cada adapter emite recordExitEvent com a plataforma correta:
 * - TG: service message left_chat_member (grupos basic) e update chat_member
 *   (supergroups, left|kicked) — e a service message NÃO segue pro fluxo
 *   de mensagens (return antecipado).
 * - DC: guildMemberRemove com groupId = dc:<guild.id> (a GUILD é o
 *   análogo do grupo, não o channel).
 * - Ajuste 3: boot do Discord loga GuildMembers intent: enabled|disabled.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks (hoisted) ────────────────────────────────────────────────────────
vi.mock('../../src/services/loggerService', () => ({
  default: { info: () => {}, warn: () => {}, error: () => {} },
  logInfo: vi.fn(),
  logWarning: vi.fn(),
  logError: vi.fn(),
}));

const recordExitEvent = vi.fn().mockResolvedValue('ev-1');
const isFeedbackEnabledForGroup = vi.fn().mockResolvedValue(true);
vi.mock('../../src/services/feedbackService', () => ({
  recordExitEvent: (...a: any[]) => recordExitEvent(...a),
  isFeedbackEnabledForGroup: (...a: any[]) => isFeedbackEnabledForGroup(...a),
  consolidatePending: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/services/autoModEngine', () => ({
  evaluate: vi.fn().mockResolvedValue({ action: 'allow' }),
  extractTextFromWAMessage: vi.fn(() => ''),
}));

vi.mock('../../src/services/permissions', () => ({
  isProtectedTarget: vi.fn().mockResolvedValue(false),
}));

// captureTelegramMessage persiste via databaseService — stub genérico para
// não tocar DB real (o fluxo de mensagens comum do handler é best-effort).
vi.mock('../../src/services/databaseService', () => {
  const conn = { run: async () => {}, get: async () => undefined, all: async () => [] };
  return new Proxy({}, {
    get: (_t: any, prop: any) => {
      if (typeof prop === 'symbol') return undefined;
      if (prop === 'getDb') return async () => conn;
      return async () => undefined;
    },
  });
});

vi.mock('telegraf', () => {
  const { EventEmitter } = require('events');
  class MockTelegraf extends EventEmitter {
    launch = vi.fn().mockResolvedValue(undefined);
    stop = vi.fn().mockResolvedValue(undefined);
    telegram = {
      sendMessage: vi.fn().mockResolvedValue({ message_id: 1 }),
      getChat: vi.fn(),
      getMe: vi.fn().mockResolvedValue({ id: 12345, username: 'MockBot' }),
    };
    catch = vi.fn();
    on = vi.fn();
  }
  return { Telegraf: MockTelegraf };
});

vi.mock('discord.js', () => {
  const { EventEmitter } = require('events');
  class MockDiscordClient extends EventEmitter {
    user = { id: '1111', username: 'TestDiscordBot', setPresence: vi.fn() };
    options = { intents: { has: (bit: string) => bit === 'GuildMembers' } };
    login = vi.fn().mockResolvedValue(undefined);
    destroy = vi.fn().mockResolvedValue(undefined);
    channels = { fetch: vi.fn(), cache: new Map() };
    guilds = { cache: { values: () => [][Symbol.iterator]() } };
    users = { fetch: vi.fn().mockResolvedValue({ id: '2222', send: vi.fn() }) };
  }
  const GatewayIntentBits = {
    Guilds: 1, GuildMessages: 2, MessageContent: 4,
    DirectMessages: 8, GuildMembers: 16, GuildVoiceStates: 32,
  };
  const Partials = { Channel: 'Channel', Message: 'Message', User: 'User' };
  return { Client: MockDiscordClient, GatewayIntentBits, Partials, TextChannel: class {} };
});

// ─── Suíte ──────────────────────────────────────────────────────────────────
import { TelegramAdapter } from '../../src/platforms/telegram/TelegramAdapter';
import { DiscordAdapter } from '../../src/platforms/discord/DiscordAdapter';
import { logInfo, logWarning } from '../../src/services/loggerService';

/** Handler registrado no bot (mock) pelo setupEventHandlers do adapter. */
function registeredHandler(adapter: any, event: string, bot = 'bot'): any {
  const calls = adapter[bot].on.mock.calls.filter((c: any[]) => c[0] === event);
  return calls.length ? calls[calls.length - 1][1] : null;
}

beforeEach(() => {
  recordExitEvent.mockClear();
  isFeedbackEnabledForGroup.mockClear();
  (isFeedbackEnabledForGroup as any).mockResolvedValue(true);
  (logInfo as any).mockClear();
  (logWarning as any).mockClear();
});

describe('INC-024 — TelegramAdapter: leave', () => {
  it('service message left_chat_member → recordExitEvent platform=telegram', async () => {
    const adapter: any = new TelegramAdapter('dummy-token');
    const handler = registeredHandler(adapter, 'message');
    expect(handler).toBeTruthy();
    await handler({
      message: { left_chat_member: { id: 111222333, first_name: 'João' }, message_id: 10 },
      chat: { id: -100123456, title: 'Grupo TG', type: 'supergroup' },
      from: { id: 999 },
    });
    expect(isFeedbackEnabledForGroup).toHaveBeenCalledWith('tg:-100123456');
    expect(recordExitEvent).toHaveBeenCalledTimes(1);
    const input = recordExitEvent.mock.calls[0][0];
    expect(input.platform).toBe('telegram');
    expect(input.userId).toBe('111222333');
    expect(input.groupId).toBe('tg:-100123456');
    expect(input.groupName).toBe('Grupo TG');
    expect(input.displayName).toBe('João');
  });

  it('service message de JOIN não grava evento de leave', async () => {
    const adapter: any = new TelegramAdapter('dummy-token');
    const handler = registeredHandler(adapter, 'message');
    await handler({
      message: { new_chat_members: [{ id: 111222333, first_name: 'João' }], message_id: 11 },
      chat: { id: -100123456, title: 'Grupo TG', type: 'supergroup' },
    });
    expect(recordExitEvent).not.toHaveBeenCalled();
  });

  it('update chat_member status=left (supergroup) → recordExitEvent', async () => {
    const adapter: any = new TelegramAdapter('dummy-token');
    const handler = registeredHandler(adapter, 'chat_member');
    expect(handler).toBeTruthy();
    await handler({
      update: {
        chat_member: {
          chat: { id: -100123456, title: 'Grupo TG' },
          new_chat_member: {
            status: 'left',
            user: { id: 111222333, first_name: 'João', username: 'joaotg' },
          },
        },
      },
    });
    expect(recordExitEvent).toHaveBeenCalledTimes(1);
    const input = recordExitEvent.mock.calls[0][0];
    expect(input.platform).toBe('telegram');
    expect(input.userId).toBe('111222333');
  });

  it('update chat_member status=kicked (remoção) → também grava', async () => {
    const adapter: any = new TelegramAdapter('dummy-token');
    const handler = registeredHandler(adapter, 'chat_member');
    await handler({
      update: {
        chat_member: {
          chat: { id: -100123456, title: 'Grupo TG' },
          new_chat_member: { status: 'kicked', user: { id: 111222444, first_name: 'Ana' } },
        },
      },
    });
    expect(recordExitEvent).toHaveBeenCalledTimes(1);
  });

  it('update chat_member status=member (join) → ignora', async () => {
    const adapter: any = new TelegramAdapter('dummy-token');
    const handler = registeredHandler(adapter, 'chat_member');
    await handler({
      update: {
        chat_member: {
          chat: { id: -100123456, title: 'Grupo TG' },
          new_chat_member: { status: 'member', user: { id: 111222555 } },
        },
      },
    });
    expect(recordExitEvent).not.toHaveBeenCalled();
  });

  it('gate desativado (feedback off) → não grava', async () => {
    (isFeedbackEnabledForGroup as any).mockResolvedValue(false);
    const adapter: any = new TelegramAdapter('dummy-token');
    const handler = registeredHandler(adapter, 'chat_member');
    await handler({
      update: {
        chat_member: {
          chat: { id: -100123456, title: 'Grupo TG' },
          new_chat_member: { status: 'left', user: { id: 111222333 } },
        },
      },
    });
    expect(recordExitEvent).not.toHaveBeenCalled();
  });

  it('launch() pede allowed_updates com chat_member', async () => {
    const adapter: any = new TelegramAdapter('dummy-token');
    await adapter.client.launch();
    const call = (adapter.bot.launch as any).mock.calls[0];
    expect(call?.[0]?.allowed_updates).toContain('chat_member');
    expect(call?.[0]?.allowed_updates).toContain('message');
  });
});

describe('INC-024 — DiscordAdapter: leave + intent', () => {
  /** Client discord.js REAL (adapter.client é o wrapper PlatformClient). */
  function innerClient(adapter: any): any {
    return adapter.client.client;
  }

  it('guildMemberRemove → recordExitEvent platform=discord com groupId dc:<guild.id>', async () => {
    const adapter: any = new DiscordAdapter('dummy-token');
    const member = {
      id: '444555666777888',
      displayName: 'Maria',
      user: { username: 'maria' },
      guild: { id: '999888777666', name: 'Guild Teste' },
    };
    innerClient(adapter).emit('guildMemberRemove', member);
    await new Promise((r) => setTimeout(r, 20));
    expect(isFeedbackEnabledForGroup).toHaveBeenCalledWith('dc:999888777666');
    expect(recordExitEvent).toHaveBeenCalledTimes(1);
    const input = recordExitEvent.mock.calls[0][0];
    expect(input.platform).toBe('discord');
    expect(input.userId).toBe('444555666777888');
    expect(input.groupId).toBe('dc:999888777666');
    expect(input.groupName).toBe('Guild Teste');
  });

  it('gate desativado → não grava', async () => {
    (isFeedbackEnabledForGroup as any).mockResolvedValue(false);
    const adapter: any = new DiscordAdapter('dummy-token');
    innerClient(adapter).emit('guildMemberRemove', {
      id: '1', displayName: 'X', user: {}, guild: { id: '999888777666', name: 'G' },
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(recordExitEvent).not.toHaveBeenCalled();
  });

  it('ajuste 3: boot loga GuildMembers intent: enabled (com intents.has)', async () => {
    const adapter: any = new DiscordAdapter('dummy-token');
    const inner = innerClient(adapter);
    inner.emit('ready', inner);
    expect(logInfo).toHaveBeenCalledWith('[DiscordAdapter] GuildMembers intent: enabled');
    expect(logWarning).not.toHaveBeenCalledWith(
      '[DiscordAdapter] feedback Discord não vai funcionar sem GuildMembers intent',
    );
  });

  it('ajuste 3: intent desabilitado → WARN literal', async () => {
    const adapter: any = new DiscordAdapter('dummy-token');
    const inner = innerClient(adapter);
    inner.options.intents.has = () => false;
    inner.emit('ready', inner);
    expect(logInfo).toHaveBeenCalledWith('[DiscordAdapter] GuildMembers intent: disabled');
    expect(logWarning).toHaveBeenCalledWith(
      '[DiscordAdapter] feedback Discord não vai funcionar sem GuildMembers intent',
    );
  });
});
