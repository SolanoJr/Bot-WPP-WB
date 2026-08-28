import { describe, expect, it } from 'vitest';
import { resolveCustomCommand } from '../../src/bot/customCommands.js';

describe('custom command compatibility', () => {
    it('resolve comandos no formato tipado novo', () => {
        const response = {
            success: true,
            data: {
                welcomeMessage: null,
                customCommands: {
                    regras: 'Sem spam.'
                },
                antispamActive: 0,
                isActive: true
            }
        };

        expect(resolveCustomCommand(response, 'regras')).toBe('Sem spam.');
    });

    it('resolve comandos no formato legado espalhado na resposta', () => {
        const response = {
            success: true,
            welcomeMessage: null,
            customCommands: {
                pix: 'Chave PIX aqui.'
            },
            antispamActive: 0,
            isActive: true
        };

        expect(resolveCustomCommand(response, 'pix')).toBe('Chave PIX aqui.');
    });

    it('retorna null quando o comando nao existe', () => {
        expect(resolveCustomCommand({ success: true, data: null }, 'nada')).toBeNull();
    });
});
