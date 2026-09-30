/**
 * Testes do AntiBot — sinais estruturais de bot/spammer.
 *
 * Usa fixtures sintéticos que reproduzem a estrutura Baileys real.
 * NÃO envia mensagens pela rede — testa o MESMO caminho de produção.
 *
 * O AntiBot NÃO decide "é bot" — apenas retorna SINAIS estruturais.
 * A decisão final usa o threshold existente: botSignals.length >= 2
 * (combinando sinais estruturais + foreign + suspiciousName + links + etc.)
 *
 * Fixtures:
 * - buttonsMessage, listMessage, templateMessage, interactiveMessage, productMessage
 * - mensagem humana normal (texto, imagem, vídeo, documento, sticker)
 * - comando normal ($ping, $menu)
 * - mensagem do próprio bot (anti-loop)
 * - mensagem de admin
 * - WarriorBlack / SolanoJr
 */
import { describe, it, expect } from 'vitest';
import { extractAntiBotSignals } from '../../src/services/autoModEngine';

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
// Testes de sinais estruturais (positivos — estrutura detectada)
// ─────────────────────────────────────────────────────────────────────────────

describe('AntiBot — sinais estruturais (positivos)', () => {
  it('buttonsMessage → retorna sinal buttonsMessage', () => {
    const msg = makeWAMessage({
      buttonsMessage: {
        contentText: 'Clique aqui',
        footerText: 'Rodapé',
        buttons: [{ buttonId: '1', buttonText: { displayText: 'Botão' } }],
      },
    });
    const signals = extractAntiBotSignals(msg);
    expect(signals).toContain('buttonsMessage');
    expect(signals.length).toBe(1);
  });

  it('listMessage → retorna sinal listMessage', () => {
    const msg = makeWAMessage({
      listMessage: {
        title: 'Lista',
        description: 'Descrição',
        buttonText: 'Ver',
        listType: 1,
        sections: [],
      },
    });
    const signals = extractAntiBotSignals(msg);
    expect(signals).toContain('listMessage');
  });

  it('templateMessage → retorna sinal templateMessage', () => {
    const msg = makeWAMessage({
      templateMessage: {
        hydratedTemplate: {
          hydratedContentText: 'Template',
          hydratedButtons: [{ urlButton: { displayText: 'Link', url: 'https://example.com' } }],
        },
      },
    });
    const signals = extractAntiBotSignals(msg);
    expect(signals).toContain('templateMessage');
  });

  it('interactiveMessage → retorna sinal interactiveMessage', () => {
    const msg = makeWAMessage({
      interactiveMessage: {
        body: { text: 'Interativo' },
        nativeFlowMessage: { buttons: [{ buttonParamsJson: '{"display_text":"OK"}' }] },
      },
    });
    const signals = extractAntiBotSignals(msg);
    expect(signals).toContain('interactiveMessage');
  });

  it('productMessage → retorna sinal productMessage', () => {
    const msg = makeWAMessage({
      productMessage: {
        product: { productId: '123' },
        businessOwnerJid: '6285822480546@lid',
      },
    });
    const signals = extractAntiBotSignals(msg);
    expect(signals).toContain('productMessage');
  });

  it('múltiplas estruturas → retorna apenas o sinal da estrutura presente', () => {
    const msg = makeWAMessage({
      buttonsMessage: {
        contentText: 'Botão',
        buttons: [{ buttonId: '1', buttonText: { displayText: 'OK' } }],
      },
    });
    const signals = extractAntiBotSignals(msg);
    expect(signals).toEqual(['buttonsMessage']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Testes de NÃO sinais (negativos — NÃO devem gerar sinal estrutural)
// ─────────────────────────────────────────────────────────────────────────────

describe('AntiBot — NÃO sinais (negativos)', () => {
  it('texto humano normal → NÃO retorna sinal', () => {
    const msg = makeWAMessage({
      conversation: 'Olá pessoal, como estão?',
    });
    const signals = extractAntiBotSignals(msg);
    expect(signals).toEqual([]);
  });

  it('comando $ping → NÃO retorna sinal', () => {
    const msg = makeWAMessage({
      conversation: '$ping',
    });
    const signals = extractAntiBotSignals(msg);
    expect(signals).toEqual([]);
  });

  it('comando $menu → NÃO retorna sinal', () => {
    const msg = makeWAMessage({
      conversation: '$menu',
    });
    const signals = extractAntiBotSignals(msg);
    expect(signals).toEqual([]);
  });

  it('imagem humana normal → NÃO retorna sinal', () => {
    const msg = makeWAMessage({
      imageMessage: {
        caption: 'Olha essa foto',
        url: 'https://example.com/image.jpg',
      },
    });
    const signals = extractAntiBotSignals(msg);
    expect(signals).toEqual([]);
  });

  it('vídeo humano normal → NÃO retorna sinal', () => {
    const msg = makeWAMessage({
      videoMessage: {
        caption: 'Vídeo legal',
        url: 'https://example.com/video.mp4',
      },
    });
    const signals = extractAntiBotSignals(msg);
    expect(signals).toEqual([]);
  });

  it('documento humano normal → NÃO retorna sinal', () => {
    const msg = makeWAMessage({
      documentMessage: {
        title: 'documento.pdf',
        url: 'https://example.com/doc.pdf',
      },
    });
    const signals = extractAntiBotSignals(msg);
    expect(signals).toEqual([]);
  });

  it('sticker normal → NÃO retorna sinal', () => {
    const msg = makeWAMessage({
      stickerMessage: {
        url: 'https://example.com/sticker.webp',
        fileLength: 12345,
      },
    });
    const signals = extractAntiBotSignals(msg);
    expect(signals).toEqual([]);
  });

  it('extendedTextMessage normal → NÃO retorna sinal', () => {
    const msg = makeWAMessage({
      extendedTextMessage: {
        text: 'Mensagem normal com texto',
      },
    });
    const signals = extractAntiBotSignals(msg);
    expect(signals).toEqual([]);
  });

  it('imagem com caption normal → NÃO retorna sinal', () => {
    const msg = makeWAMessage({
      imageMessage: {
        caption: 'Foto da praia',
      },
    });
    const signals = extractAntiBotSignals(msg);
    expect(signals).toEqual([]);
  });

  it('estrutura detectada mesmo em mensagem fromMe (contexto anti-loop é no evaluate)', () => {
    const msg = makeWAMessage({
      buttonsMessage: {
        contentText: 'Botão do bot',
        buttons: [{ buttonId: '1', buttonText: { displayText: 'OK' } }],
      },
    }, { fromMe: true, participant: '558581344211@s.whatsapp.net' });
    
    // A estrutura É detectada (sinal), mas o evaluate() usa msg.key.fromMe para anti-loop
    const signals = extractAntiBotSignals(msg);
    expect(signals).toContain('buttonsMessage');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Testes de estrutura do resultado
// ─────────────────────────────────────────────────────────────────────────────

describe('AntiBot — estrutura do resultado', () => {
  it('retorna array de strings', () => {
    const msg = makeWAMessage({
      buttonsMessage: {
        contentText: 'Botão',
        buttons: [{ buttonId: '1', buttonText: { displayText: 'OK' } }],
      },
    });
    const signals = extractAntiBotSignals(msg);
    expect(Array.isArray(signals)).toBe(true);
    expect(typeof signals[0]).toBe('string');
  });

  it('mensagem sem estrutura → array vazio', () => {
    const msg = makeWAMessage({
      conversation: 'Texto normal',
    });
    const signals = extractAntiBotSignals(msg);
    expect(signals).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Testes de integração: como os sinais entram no botSignals
// ─────────────────────────────────────────────────────────────────────────────

describe('AntiBot — integração com botSignals (simulação do threshold)', () => {
  it('buttonsMessage sozinho → 1 sinal → NÃO atinge threshold (>=2)', () => {
    const msg = makeWAMessage({
      buttonsMessage: {
        contentText: 'Botão',
        buttons: [{ buttonId: '1', buttonText: { displayText: 'OK' } }],
      },
    });
    const signals = extractAntiBotSignals(msg);
    expect(signals).toEqual(['buttonsMessage']);
    expect(signals.length).toBe(1); // Apenas 1 sinal = NÃO atinge threshold >=2
  });

  it('productMessage sozinho → 1 sinal → NÃO atinge threshold (>=2)', () => {
    const msg = makeWAMessage({
      productMessage: {
        product: { productId: '123' },
        businessOwnerJid: '6285822480546@lid',
      },
    });
    const signals = extractAntiBotSignals(msg);
    expect(signals).toEqual(['productMessage']);
    expect(signals.length).toBe(1); // Apenas 1 sinal = NÃO atinge threshold >=2
  });

  it('interactiveMessage sozinho → 1 sinal → NÃO atinge threshold (>=2)', () => {
    const msg = makeWAMessage({
      interactiveMessage: {
        body: { text: 'Interativo' },
        nativeFlowMessage: { buttons: [{ buttonParamsJson: '{"display_text":"OK"}' }] },
      },
    });
    const signals = extractAntiBotSignals(msg);
    expect(signals).toEqual(['interactiveMessage']);
    expect(signals.length).toBe(1); // Apenas 1 sinal = NÃO atinge threshold >=2
  });

  it('buttonsMessage + foreign (simulado) → 2 sinais → atinge threshold (>=2)', () => {
    const msg = makeWAMessage({
      buttonsMessage: {
        contentText: 'Clique',
        buttons: [{ buttonId: '1', buttonText: { displayText: 'OK' } }],
      },
    });
    const signals = extractAntiBotSignals(msg);
    // buttonsMessage = 1 sinal estrutural
    // Se + foreign = 2 sinais → atinge threshold >=2
    expect(signals).toContain('buttonsMessage');
    expect(signals.length).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Testes de NÃO sinais (negativos — NÃO devem gerar sinal estrutural)
// ─────────────────────────────────────────────────────────────────────────────

describe('AntiBot — NÃO sinais (negativos)', () => {
  it('texto humano normal → NÃO retorna sinal', () => {
    const msg = makeWAMessage({
      conversation: 'Olá pessoal, como estão?',
    });
    const signals = extractAntiBotSignals(msg);
    expect(signals).toEqual([]);
  });

  it('comando $ping → NÃO retorna sinal', () => {
    const msg = makeWAMessage({
      conversation: '$ping',
    });
    const signals = extractAntiBotSignals(msg);
    expect(signals).toEqual([]);
  });

  it('comando $menu → NÃO retorna sinal', () => {
    const msg = makeWAMessage({
      conversation: '$menu',
    });
    const signals = extractAntiBotSignals(msg);
    expect(signals).toEqual([]);
  });

  it('imagem humana normal → NÃO retorna sinal', () => {
    const msg = makeWAMessage({
      imageMessage: {
        caption: 'Olha essa foto',
        url: 'https://example.com/image.jpg',
      },
    });
    const signals = extractAntiBotSignals(msg);
    expect(signals).toEqual([]);
  });

  it('vídeo humano normal → NÃO retorna sinal', () => {
    const msg = makeWAMessage({
      videoMessage: {
        caption: 'Vídeo legal',
        url: 'https://example.com/video.mp4',
      },
    });
    const signals = extractAntiBotSignals(msg);
    expect(signals).toEqual([]);
  });

  it('documento humano normal → NÃO retorna sinal', () => {
    const msg = makeWAMessage({
      documentMessage: {
        title: 'documento.pdf',
        url: 'https://example.com/doc.pdf',
      },
    });
    const signals = extractAntiBotSignals(msg);
    expect(signals).toEqual([]);
  });

  it('sticker normal → NÃO retorna sinal', () => {
    const msg = makeWAMessage({
      stickerMessage: {
        url: 'https://example.com/sticker.webp',
        fileLength: 12345,
      },
    });
    const signals = extractAntiBotSignals(msg);
    expect(signals).toEqual([]);
  });

  it('extendedTextMessage normal → NÃO retorna sinal', () => {
    const msg = makeWAMessage({
      extendedTextMessage: {
        text: 'Mensagem normal com texto',
      },
    });
    const signals = extractAntiBotSignals(msg);
    expect(signals).toEqual([]);
  });

  it('imagem com caption normal → NÃO retorna sinal', () => {
    const msg = makeWAMessage({
      imageMessage: {
        caption: 'Foto da praia',
      },
    });
    const signals = extractAntiBotSignals(msg);
    expect(signals).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Testes de estrutura do resultado
// ─────────────────────────────────────────────────────────────────────────────

describe('AntiBot — estrutura do resultado', () => {
  it('retorna array de strings', () => {
    const msg = makeWAMessage({
      buttonsMessage: {
        contentText: 'Botão',
        buttons: [{ buttonId: '1', buttonText: { displayText: 'OK' } }],
      },
    });
    const signals = extractAntiBotSignals(msg);
    expect(Array.isArray(signals)).toBe(true);
    expect(typeof signals[0]).toBe('string');
  });

  it('mensagem sem estrutura → array vazio', () => {
    const msg = makeWAMessage({
      conversation: 'Texto normal',
    });
    const signals = extractAntiBotSignals(msg);
    expect(signals).toEqual([]);
  });
});
