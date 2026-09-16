import { describe, it, expect } from 'vitest';
import {
  classifyCasino,
  hasButtonsMessage,
  hasTemplateMessage,
  hasSuspiciousDomain,
  hasCasinoKeywords,
  hasExternalLinks,
  isForeignNumber,
  hasSuspiciousDisplayName,
  extractAllText,
} from '../../src/services/casinoClassifier';

describe('casinoClassifier', () => {
  describe('individual signal detectors', () => {
    it('detects buttons message', () => {
      expect(hasButtonsMessage({ buttonsMessage: { contentText: 'Test' } })).toBe(true);
      expect(hasButtonsMessage({ conversation: 'Hello' })).toBe(false);
    });

    it('detects template/interactive message', () => {
      expect(hasTemplateMessage({ templateMessage: {} })).toBe(true);
      expect(hasTemplateMessage({ interactiveMessage: {} })).toBe(true);
      expect(hasTemplateMessage({ listMessage: {} })).toBe(true);
      expect(hasTemplateMessage({ conversation: 'Hello' })).toBe(false);
    });

    it('detects casino domains', () => {
      expect(hasSuspiciousDomain('jogue agora no kl7.games')).toBe(true);
      expect(hasSuspiciousDomain('visite ck7bet.com')).toBe(true);
      expect(hasSuspiciousDomain('site betano.com.br')).toBe(true);
      expect(hasSuspiciousDomain('whatsapp.com')).toBe(false);
      expect(hasSuspiciousDomain('youtube.com/watch')).toBe(false);
    });

    it('detects casino keywords', () => {
      expect(hasCasinoKeywords('ganhe dinheiro fácil')).toBe(true);
      expect(hasCasinoKeywords('bônus de boas-vindas')).toBe(true);
      expect(hasCasinoKeywords('777 grátis')).toBe(true);
      expect(hasCasinoKeywords('olá tudo bem')).toBe(false);
    });

    it('detects external links', () => {
      expect(hasExternalLinks('visite https://kl7.games agora')).toBe(true);
      expect(hasExternalLinks('veja https://youtube.com/watch')).toBe(false);
      expect(hasExternalLinks('sem links aqui')).toBe(false);
    });

    it('detects foreign numbers', () => {
      expect(isForeignNumber('6282364007211@s.whatsapp.net')).toBe(true);
      expect(isForeignNumber('558581344211@s.whatsapp.net')).toBe(false);
      expect(isForeignNumber('120363410094452673@g.us')).toBe(false);
    });

    it('detects suspicious display names', () => {
      expect(hasSuspiciousDisplayName('')).toBe(true);
      expect(hasSuspiciousDisplayName('🤖')).toBe(true);
      expect(hasSuspiciousDisplayName('bot')).toBe(true);
      expect(hasSuspiciousDisplayName('João Silva')).toBe(false);
      expect(hasSuspiciousDisplayName('Maria')).toBe(false);
    });
  });

  describe('classifyCasino', () => {
    it('does NOT classify normal conversation', () => {
      const result = classifyCasino(
        { message: { conversation: 'Olá, tudo bem?' } },
        '558581344211@s.whatsapp.net',
        'João'
      );
      expect(result.detected).toBe(false);
      expect(result.confidence).toBeLessThan(40);
    });

    it('does NOT classify Brazilian text without casino signals', () => {
      const result = classifyCasino(
        { message: { conversation: 'Alguém quer jogar futebol hoje?' } },
        '5588998314322@s.whatsapp.net',
        'Maria'
      );
      expect(result.detected).toBe(false);
    });

    it('classifies casino message with multiple signals', () => {
      const msg = {
        message: {
          buttonsMessage: {
            contentText: '🎰 BEM-VINDO AO CASSINO! Ganhe bônus de R$ 77,777!',
            buttons: [{ buttonText: { displayText: 'JOGAR AGORA' }, buttonId: 'play' }],
          },
        },
      };
      const result = classifyCasino(msg, '1234567890@s.whatsapp.net', '🤖 Bot');
      expect(result.detected).toBe(true);
      expect(result.confidence).toBeGreaterThanOrEqual(60);
      expect(result.signals).toContain('buttons-message');
      expect(result.signals).toContain('foreign-number');
      expect(result.signals).toContain('casino-keywords');
    });

    it('classifies interactive message with casino domain', () => {
      const msg = {
        message: {
          interactiveMessage: {
            body: { text: 'Acesse kl7.games e ganhe bônus exclusivo!' },
            nativeFlowMessage: { buttons: [] },
          },
        },
      };
      const result = classifyCasino(msg, '1234567890@s.whatsapp.net', '');
      expect(result.detected).toBe(true);
      expect(result.confidence).toBeGreaterThanOrEqual(60);
      expect(result.signals).toContain('template-message');
      expect(result.signals).toContain('casino-domain');
    });

    it('does NOT classify single signal as casino', () => {
      const msg = {
        message: { conversation: 'bônus' },
      };
      const result = classifyCasino(msg, '5588998314322@s.whatsapp.net', 'João');
      expect(result.detected).toBe(false);
      expect(result.signals.length).toBeLessThan(2);
    });

    it('classifier does NOT protect SolanoJr — protection is at autoModEngine level', () => {
      const msg = {
        message: { conversation: 'Promoção cassino bônus 777' },
      };
      const result = classifyCasino(msg, '558898314322@s.whatsapp.net', 'SolanoJr');
      expect(result.signals).toContain('casino-keywords');
      // 558898314322 é número brasileiro (55), NÃO gera foreign-number
      expect(result.signals).not.toContain('foreign-number');
    });
  });

  describe('extractAllText', () => {
    it('extracts text from conversation', () => {
      expect(extractAllText({ message: { conversation: 'Hello' } })).toBe('Hello');
    });

    it('extracts text from buttons message', () => {
      const msg = {
        message: {
          buttonsMessage: {
            contentText: 'Title',
            footerText: 'Footer',
            buttons: [{ buttonText: { displayText: 'Click' }, buttonId: '1' }],
          },
        },
      };
      const text = extractAllText(msg);
      expect(text).toContain('Title');
      expect(text).toContain('Footer');
      expect(text).toContain('Click');
    });

    it('extracts text from template message', () => {
      const msg = {
        message: {
          templateMessage: {
            hydratedTemplate: {
              hydratedContentText: 'Content',
              hydratedTitleText: 'Title',
            },
          },
        },
      };
      const text = extractAllText(msg);
      expect(text).toContain('Content');
      expect(text).toContain('Title');
    });
  });
});
