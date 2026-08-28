import { describe, it, expect, vi } from 'vitest';
import { loadCommands } from '../../src/bot/commands/index';

describe('Integração de Comandos', () => {
    const commands = loadCommands();
    const mockMsg = {
        reply: vi.fn(),
        author: '5588998314322@c.us',
        from: '5588998314322@c.us',
        getChat: vi.fn().mockResolvedValue({
            isGroup: false,
            id: { _serialized: '5588998314322@c.us' }
        })
    };

    const criticalCommands = ['ping', 'help', 'menu', 'alive', 'stats', 'clima'];

    criticalCommands.forEach(cmdName => {
        it(`deve carregar e ter estrutura básica para o comando: ${cmdName}`, () => {
            const cmd = commands.get(cmdName);
            expect(cmd).toBeDefined();
            expect(cmd).toHaveProperty('name');
            expect(cmd).toHaveProperty('execute');
        });
    });

    it('deve responder corretamente ao comando $ping', async () => {
        const pingCmd = commands.get('ping');
        await pingCmd?.execute(mockMsg, {}, []);
        expect(mockMsg.reply).toHaveBeenCalled();
    });

    it('deve carregar todos os comandos registrados no index', () => {
        // Atualmente temos cerca de 40+ comandos registrados
        expect(commands.size).toBeGreaterThan(30);
    });
});
