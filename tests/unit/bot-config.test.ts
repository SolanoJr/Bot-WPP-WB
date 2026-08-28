import { describe, expect, it } from 'vitest';
import { validateWarriorAuthKey } from '../../src/bot/config.js';

describe('Bot config', () => {
    it('aceita Warrior key com exatamente 16 caracteres', () => {
        expect(validateWarriorAuthKey('solano_wb_gps_26')).toBe('solano_wb_gps_26');
    });

    it('rejeita Warrior key ausente ou com tamanho incorreto', () => {
        expect(() => validateWarriorAuthKey(undefined)).toThrow('exatamente 16 caracteres');
        expect(() => validateWarriorAuthKey('curta')).toThrow('recebido 5');
        expect(() => validateWarriorAuthKey('solano_wb_gps_260')).toThrow('recebido 17');
    });
});
