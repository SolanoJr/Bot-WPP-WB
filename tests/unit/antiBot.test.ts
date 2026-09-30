/**
 * Testes do AntiBot — detecção estrutural de bot/spammer.
 *
 * Usa fixtures sintéticos que reproduzem a estrutura Baileys real.
 * NÃO envia mensagens pela rede — testa o MESMO caminho de produção.
 *
 * Fixtures:
 * - buttonsMessage, listMessage, templateMessage, interactiveMessage, productMessage
 * - mensagem humana normal (texto, imagem, vídeo, documento, sticker)
 * - comando normal ($ping, $menu)
 * - mensagem do próprio bot (anti-loop)
 */
import { describe, it, expect, vi } from 'vitest';
import { detectAntiBot, AntiBotResult } from '../../src/services/autoModEngine';

// ─────────────────────────────────────────────────────────────────────────────
// Fixters sintéticos — reproduzem a estrutura Baileys real
// ─────────────────────────────────────────────────────────────────────────────

function makeWAMessage(messageObj: any, key: any = {}) {
  return {
    key: {
      id: 'test-msg-id',
      remoteJid: '120363419033272638@g.us',
      fromMe: false,
      participant: '6285822480546@lid',
      ...key,
    },
    message: messageObj,
    messageTimestamp: Math.floor(Date.now() / 1000),
  } as any;
}

// ─────────────────────────────────────────────────────────────────────────────
// Testes positivos — devem detectar bot
// ─────────────────────────────────────────────────────────────────────────────

describe('AntiBot — detecção estrutural (positivos)', () => {
  it('buttonsMessage → detecta bot', () => {
    const msg = makeWAMessage({
      buttonsMessage: {
        contentText: 'Clique aqui',
        footerText: 'Rodapé',
        buttons: [{ buttonId: '1', buttonText: { displayText: 'Botão' } }],
      },
    });
    const result = detectAntiBot(msg, '6285822480546@lid', 'Spammer');
    expect(result.detected).toBe(true);
    expect(result.type).toBe('buttonsMessage');
    expect(result.signals).toContain('buttonsMessage');
  });

  it('listMessage → detecta bot', () => {
    const msg = makeWAMessage({
      listMessage: {
        title: 'Lista',
        description: 'Descrição',
        buttonText: 'Ver',
        listType: 1,
        sections: [],
      },
    });
    const result = detectAntiBot(msg, '6285822480546@lid', 'Spammer');
    expect(result.detected).toBe(true);
    expect(result.type).toBe('listMessage');
  });

  it('templateMessage → detecta bot', () => {
    const msg = makeWAMessage({
      templateMessage: {
        hydratedTemplate: {
          hydratedContentText: 'Template',
          hydratedButtons: [{ urlButton: { displayText: 'Link', url: 'https://example.com' } }],
        },
      },
    });
    const result = detectAntiBot(msg, '6285822480546@lid', 'Spammer');
    expect(result.detected).toBe(true);
    expect(result.type).toBe('templateMessage');
  });

  it('interactiveMessage → detecta bot', () => {
    const msg = makeWAMessage({
      interactiveMessage: {
        body: { text: 'Interativo' },
        nativeFlowMessage: { buttons: [{ buttonParamsJson: '{"display_text":"OK"}' }] },
      },
    });
    const result = detectAntiBot(msg, '6285822480546@lid', 'Spammer');
    expect(result.detected).toBe(true);
    expect(result.type).toBe('interactiveMessage');
  });

  it('productMessage → detecta bot', () => {
    const msg = makeWAMessage({
      productMessage: {
        product: { productId: '123' },
        businessOwnerJid: '6285822480546@lid',
      },
    });
    const result = detectAntiBot(msg, '6285822480546@lid', 'Spammer');
    expect(result.detected).toBe(true);
    expect(result.type).toBe('productMessage');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Testes negativos — NÃO devem detectar bot
// ─────────────────────────────────────────────────────────────────────────────

describe('AntiBot — falsos positivos (negativos)', () => {
  it('texto humano normal → NÃO detecta', () => {
    const msg = makeWAMessage({
      conversation: 'Olá pessoal, como estão?',
    });
    const result = detectAntiBot(msg, '558581344211@c.us', 'SolanoJr');
    expect(result.detected).toBe(false);
  });

  it('comando $ping → NÃO detecta', () => {
    const msg = makeWAMessage({
      conversation: '$ping',
    });
    const result = detectAntiBot(msg, '558581344211@c.us', 'SolanoJr');
    expect(result.detected).toBe(false);
  });

  it('comando $menu → NÃO detecta', () => {
    const msg = makeWAMessage({
      conversation: '$menu',
    });
    const result = detectAntiBot(msg, '558581344211@c.us', 'SolanoJr');
    expect(result.detected).toBe(false);
  });

  it('imagem humana normal → NÃO detecta', () => {
    const msg = makeWAMessage({
      imageMessage: {
        caption: 'Olha essa foto',
        url: 'https://example.com/image.jpg',
      },
    });
    const result = detectAntiBot(msg, '558581344211@c.us', 'SolanoJr');
    expect(result.detected).toBe(false);
  });

  it('vídeo humano normal → NÃO detecta', () => {
    const msg = makeWAMessage({
      videoMessage: {
        caption: 'Vídeo legal',
        url: 'https://example.com/video.mp4',
      },
    });
    const result = detectAntiBot(msg, '558581344211@c.us', 'SolanoJr');
    expect(result.detected).toBe(false);
  });

  it('documento humano normal → NÃO detecta', () => {
    const msg = makeWAMessage({
      documentMessage: {
        title: 'documento.pdf',
        url: 'https://example.com/doc.pdf',
      },
    });
    const result = detectAntiBot(msg, '558581344211@c.us', 'SolanoJr');
    expect(result.detected).toBe(false);
  });

  it('sticker normal → NÃO detecta', () => {
    const msg = makeWAMessage({
      stickerMessage: {
        url: 'https://example.com/sticker.webp',
        fileLength: 12345,
      },
    });
    const result = detectAntiBot(msg, '558581344211@c.us', 'SolanoJr');
    expect(result.detected).toBe(false);
  });

  it('mensagem com caption normal → NÃO detecta', () => {
    const msg = makeWAMessage({
      extendedTextMessage: {
        text: 'Mensagem normal com texto',
      },
    });
    const result = detectAntiBot(msg, '558581344211@c.us', 'SolanoJr');
    expect(result.detected).toBe(false);
  });

  it('mensagem do próprio bot → NÃO detecta (anti-loop)', () => {
    const msg = makeWAMessage({
      buttonsMessage: {
        contentText: 'Botão do bot',
        buttons: [{ buttonId: '1', buttonText: { displayText: 'OK' } }],
      },
    }, { fromMe: true, participant: '558581344211@s.whatsapp.net' });
    const result = detectAntiBot(msg, '558581344211@s.whatsapp.net', 'WarriorBlack');
    expect(result.detected).toBe(false);
    expect(result.reason).toContain('próprio bot');
  });

  it('mensagem de WarriorBlack → NÃO detecta', () => {
    const msg = makeWAMessage({
      buttonsMessage: {
        contentText: 'Botão',
        buttons: [{ buttonId: '1', buttonText: { displayText: 'OK' } }],
      },
    });
    const result = detectAntiBot(msg, '558581344211@c.us', 'WarriorBlack');
    expect(result.detected).toBe(false);
  });

  it('mensagem de SolanoJr → NÃO detecta', () => {
    const msg = makeWAMessage({
      buttonsMessage: {
        contentText: 'Botão',
        buttons: [{ buttonId: '1', buttonText: { displayText: 'OK' } }],
      },
    });
    const result = detectAntiBot(msg, '558581344211@c.us', 'SolanoJr');
    expect(result.detected).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Testes de proteção
// ─────────────────────────────────────────────────────────────────────────────

describe('AntiBot — proteção de IDs protegidos', () => {
  it('WarriorBlack nunca é detectado como bot', () => {
    const msg = makeWAMessage({
      buttonsMessage: {
        contentText: 'Botão',
        buttons: [{ buttonId: '1', buttonText: { displayText: 'OK' } }],
      },
    });
    const result = detectAntiBot(msg, '558581344211@c.us', 'WarriorBlack');
    expect(result.detected).toBe(false);
  });

  it('SolanoJr nunca é detectado como bot', () => {
    const msg = makeWAMessage({
      buttonsMessage: {
        contentText: 'Botão',
        buttons: [{ buttonId: '1', buttonText: { displayText: 'OK' } }],
      },
    });
    const result = detectAntiBot(msg, '558581344211@c.us', 'SolanoJr');
    expect(result.detected).toBe(false);
  });

  it('mensagem do próprio bot não gera loop', () => {
    const msg = makeWAMessage({
      buttonsMessage: {
        contentText: 'Botão do bot',
        buttons: [{ buttonId: '1', buttonText: { displayText: 'OK' } }],
      },
    }, { fromMe: true, participant: '558581344211@s.whatsapp.net' });
    const result = detectAntiBot(msg, '558581344211@s.whatsapp.net', 'WarriorBlack');
    expect(result.detected).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Testes de estrutura
// ─────────────────────────────────────────────────────────────────────────────

describe('AntiBot — estrutura do resultado', () => {
  it('resultado detectado tem type, reason e signals', () => {
    const msg = makeWAMessage({
      buttonsMessage: {
        contentText: 'Botão',
        buttons: [{ buttonId: '1', buttonText: { displayText: 'OK' } }],
      },
    });
    const result = detectAntiBot(msg, '6285822480546@lid', 'Spammer');
    expect(result).toHaveProperty('detected');
    expect(result).toHaveProperty('type');
    expect(result).toHaveProperty('reason');
    expect(result).toHaveProperty('signals');
    expect(result.signals.length).toBeGreaterThan(0);
  });

  it('resultado não detectado tem type vazio', () => {
    const msg = makeWAMessage({
      conversation: 'Texto normal',
    });
    const result = detectAntiBot(msg, '558581344211@c.us', 'SolanoJr');
    expect(result.type).toBe('');
    expect(result.signals.length).toBe(0);
  });
});
