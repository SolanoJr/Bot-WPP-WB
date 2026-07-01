import { describe, expect, it, vi } from 'vitest';
import { handleKeywords } from '../../src/services/keywordHandler';

describe('keywordHandler', () => {
  it('detecta e remove mensagens de trollagem', async () => {
    const msg = {
      body: 'removeu você do grupo',
      delete: vi.fn(),
      reply: vi.fn(),
      author: '558581344211@c.us',
      from: '558581344211@c.us'
    };

    const result = await handleKeywords(msg, {});
    
    expect(result).toBe(true);
    expect(msg.delete).toHaveBeenCalledWith(true);
    expect(msg.reply).toHaveBeenCalledWith('Tentativa de zoeira detectada. Hoje não, amigão. 😂');
  });

  it('responde sarcasticamente quando mencionado "bot"', async () => {
    const msg = {
      body: 'bot me ajuda',
      delete: vi.fn(),
      reply: vi.fn(),
      author: '558581344211@c.us',
      from: '558581344211@c.us'
    };

    const result = await handleKeywords(msg, {});
    
    expect(result).toBe(true);
    expect(msg.reply).toHaveBeenCalled();
  });

  it('não processa comandos como menções de bot', async () => {
    const msg = {
      body: '$bot comando',
      delete: vi.fn(),
      reply: vi.fn(),
      author: '558581344211@c.us',
      from: '558581344211@c.us'
    };

    const result = await handleKeywords(msg, {});
    
    expect(result).toBe(false);
    expect(msg.reply).not.toHaveBeenCalled();
  });

  it('retorna false para mensagens normais', async () => {
    const msg = {
      body: 'mensagem normal',
      delete: vi.fn(),
      reply: vi.fn(),
      author: '558581344211@c.us',
      from: '558581344211@c.us'
    };

    const result = await handleKeywords(msg, {});
    
    expect(result).toBe(false);
    expect(msg.delete).not.toHaveBeenCalled();
    expect(msg.reply).not.toHaveBeenCalled();
  });
});
