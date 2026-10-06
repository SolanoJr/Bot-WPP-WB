import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TEMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-group-context-'));
const previousCaptureDir = process.env.CAPTURE_DIR;
process.env.CAPTURE_DIR = TEMP_DIR;

vi.mock('../../src/bot/commands/mute', () => ({
  handleMutedMessage: vi.fn(async () => false),
}));
vi.mock('../../src/services/autoModEngine', () => ({
  evaluate: vi.fn(async () => ({ acted: false, reason: 'test', action: 'none' })),
}));
vi.mock('../../src/services/captureStore', () => ({
  appendCapture: vi.fn(() => true),
}));
vi.mock('../../src/services/presentationService', () => ({
  handlePresentationCollect: vi.fn(async () => {}),
}));
vi.mock('../../src/services/sarcasmoService', () => ({
  shouldRespond: vi.fn(() => false),
  canRespond: vi.fn(() => false),
  markResponded: vi.fn(),
  SARCASMO_TEXT: '',
}));
vi.mock('../../src/services/databaseService', () => ({
  getGroupMod: vi.fn(async () => ({ sarcasmo: false })),
}));

let BaileysMessageNormalizer: typeof import('../../src/platforms/whatsapp/baileys/BaileysMessageNormalizer').BaileysMessageNormalizer;
let platformManager: typeof import('../../src/platforms/PlatformManager').platformManager;

beforeAll(async () => {
  ({ BaileysMessageNormalizer } = await import('../../src/platforms/whatsapp/baileys/BaileysMessageNormalizer'));
  ({ platformManager } = await import('../../src/platforms/PlatformManager'));
});

afterAll(() => {
  if (previousCaptureDir === undefined) delete process.env.CAPTURE_DIR;
  else process.env.CAPTURE_DIR = previousCaptureDir;
  fs.rmSync(TEMP_DIR, { recursive: true, force: true });
});

async function makeCommandContext(remoteJid: string, rawIsGroup?: boolean) {
  let normalized: any;
  const normalizer = new BaileysMessageNormalizer({
    sock: { waitForMessage: async () => null },
    platform: 'whatsapp',
    userId: '558581344211@s.whatsapp.net',
    getChat: async () => ({ name: 'Teste', participants: [], raw: {} }),
    sendMessage: async () => ({}),
    removeParticipant: async () => {},
  });
  normalizer.setMessageHandler(async (message) => { normalized = message; });

  const rawMessage: any = {
    key: {
      id: `MSG-${remoteJid}`,
      remoteJid,
      participant: remoteJid.endsWith('@g.us') ? '5588998314322@s.whatsapp.net' : undefined,
      fromMe: false,
    },
    message: { conversation: '$delete' },
    messageTimestamp: Math.floor(Date.now() / 1000),
  };
  if (rawIsGroup !== undefined) rawMessage.isGroup = rawIsGroup;

  await normalizer.dispatchMessage(rawMessage);
  expect(normalized).toBeDefined();

  const client: any = {
    userId: '558581344211@s.whatsapp.net',
    getChat: async () => ({ name: 'Teste', participants: [], raw: {} }),
  };
  return (platformManager as any).createCommandContext(normalized, client);
}

describe('Baileys group context integration', () => {
  it('derives a group context from a raw Baileys event without isGroup', async () => {
    const context = await makeCommandContext('120363410094452673@g.us');

    expect(context.isGroup).toBe(true);
    expect(context.msg.raw.isGroup).toBe(true);
  });

  it('uses the remote JID as source of truth when isGroup is present but contradictory', async () => {
    const context = await makeCommandContext('120363410094452673@g.us', false);

    expect(context.isGroup).toBe(true);
    expect(context.msg.raw.isGroup).toBe(true);
  });

  it('does not classify a private Baileys event as a group', async () => {
    const context = await makeCommandContext('5588998314322@s.whatsapp.net', true);

    expect(context.isGroup).toBe(false);
    expect(context.msg.raw.isGroup).toBe(false);
  });

  it('captures a bot-authored marker but never dispatches it as another command', async () => {
    const previousLabMode = process.env.WPP_LAB_MODE;
    delete process.env.WPP_LAB_MODE;
    let dispatched = false;
    const normalizer = new BaileysMessageNormalizer({
      sock: { waitForMessage: async () => null },
      platform: 'whatsapp',
      userId: '558581344211@s.whatsapp.net',
      getChat: async () => ({ name: 'Teste', participants: [], raw: {} }),
      sendMessage: async () => ({}),
      removeParticipant: async () => {},
    });
    normalizer.setMessageHandler(async () => { dispatched = true; });

    try {
      await normalizer.dispatchMessage({
        key: {
          id: 'LAB-LOOP-GUARD',
          remoteJid: '120363410094452673@g.us',
          fromMe: true,
          participant: '558581344211@s.whatsapp.net',
        },
        message: { conversation: '[LAB_DELETE_TEST:unit] marcador' },
        messageTimestamp: Math.floor(Date.now() / 1000),
      });
    } finally {
      if (previousLabMode === undefined) delete process.env.WPP_LAB_MODE;
      else process.env.WPP_LAB_MODE = previousLabMode;
    }

    expect(dispatched).toBe(false);
  });
});