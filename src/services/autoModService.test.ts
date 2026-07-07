import { describe, it, expect, vi, beforeEach } from 'vitest';
import { analyzeMessage, isForeignNumber, extractTextFromInteractive } from './moderationService';

describe('AutoMod Service', () => {
    describe('isForeignNumber', () => {
        it('deve retornar false para números brasileiros (55)', () => {
            expect(isForeignNumber('5511999999999@c.us')).toBe(false);
        });

        it('deve retornar true para números estrangeiros', () => {
            expect(isForeignNumber('14155552671@c.us')).toBe(true);
            expect(isForeignNumber('639474500179@c.us')).toBe(true);
        });
    });

    describe('analyzeMessage', () => {
        it('deve detectar spam por palavras-chave', () => {
            const msg = {
                body: 'Ganhe um bónus agora no pp7.wtf',
                from: '5511999999999@c.us',
                type: 'chat'
            };
            const result = analyzeMessage(msg);
            expect(result.isSpam).toBe(true);
            expect(result.reason).toContain('SPAM DETECTADO');
        });

        it('deve detectar spam de DDI estrangeiro com link', () => {
            const msg = {
                body: 'Confira este link: http://google.com',
                author: '14155552671@c.us',
                from: '123456789@g.us',
                type: 'chat'
            };
            const result = analyzeMessage(msg);
            expect(result.isSpam).toBe(true);
            expect(result.reason).toContain('DDI ESTRANGEIRO');
        });

        it('não deve detectar spam em mensagens normais de brasileiros', () => {
            const msg = {
                body: 'Olá, tudo bem?',
                from: '5511999999999@c.us',
                type: 'chat'
            };
            const result = analyzeMessage(msg);
            expect(result.isSpam).toBe(false);
        });
    });

    describe('extractTextFromInteractiveMessage', () => {
        it('deve extrair texto de botões', () => {
            const msg = {
                body: '',
                _data: {
                    buttonsMessage: {
                        contentText: 'Texto do corpo',
                        buttons: [
                            { buttonText: { displayText: 'Botão 1' } }
                        ]
                    }
                }
            } as any;
            const text = extractTextFromInteractiveMessage(msg);
            expect(text).toContain('Texto do corpo');
            expect(text).toContain('Botão 1');
        });
    });
});
