import { describe, expect, it, vi, beforeEach } from 'vitest';
import { analyzeMessage, handleModeration, SUSPICIOUS_TERMS, resetModerationState } from '../../src/services/moderationService';

describe('moderationService', () => {
  beforeEach(() => {
    // Reset state before each test
    resetModerationState();
  });

  it('detecta palavras-chave suspeitas', () => {
    const message = { body: 'aposta aqui e ganhe dinheiro' };
    const result = analyzeMessage(message);
    
    expect(result.isSpam).toBe(true);
    expect(result.reason).toBe('palavra-chave suspeita detectada');
  });

  it('detecta links na primeira mensagem', () => {
    const message = { body: 'visite https://exemplo.com', from: 'newuser@c.us' };
    const result = analyzeMessage(message);
    
    expect(result.isSpam).toBe(true);
    expect(result.reason).toBe('link enviado na primeira mensagem');
  });

  it('detecta links em mensagens subsequentes', () => {
    // Primeiro adiciona o usuário ao seenUsers simulando uma mensagem anterior
    const firstMessage = { body: 'mensagem normal', from: 'existinguser@c.us' };
    analyzeMessage(firstMessage);
    
    // Agora envia link
    const message = { body: 'visite https://exemplo.com', from: 'existinguser@c.us' };
    const result = analyzeMessage(message);
    
    expect(result.isSpam).toBe(true);
    expect(result.reason).toBe('link suspeito detectado');
  });

  it('não detecta spam em mensagens normais', () => {
    const message = { body: 'mensagem normal do dia a dia' };
    const result = analyzeMessage(message);
    
    expect(result.isSpam).toBe(false);
    expect(result.reason).toBe('');
  });

  it('tem termos suspeitos configurados', () => {
    expect(SUSPICIOUS_TERMS).toContain('http');
    expect(SUSPICIOUS_TERMS).toContain('aposta');
    expect(SUSPICIOUS_TERMS).toContain('bet');
  });

  it('ignora mensagens do próprio bot', async () => {
    const message = { fromMe: true, body: 'aposta aqui' };
    const client = {};
    
    const result = await handleModeration(client, message);
    
    expect(result).toBe(false);
  });

  it('reseta estado de usuários vistos', () => {
    expect(() => resetModerationState()).not.toThrow();
  });
});
