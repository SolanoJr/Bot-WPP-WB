import { describe, it, expect, beforeAll } from 'vitest';
import axios from 'axios';

// Nota: Para rodar este teste, o Relay precisa estar online ou usarmos supertest
// Como estamos fazendo migração gradual, vamos simular a lógica do Repository primeiro

import { InMemoryRepository } from '../../src/relay/repositories/storage.repository.js';

describe('Relay Repository (In-Memory)', () => {
    const repo = new InMemoryRepository();

    it('deve salvar e recuperar uma localização', async () => {
        const payload = {
            token: 'test-token',
            chatId: '123456',
            location: {
                lat: -3.71,
                lng: -38.54,
                timestamp: new Date().toISOString()
            }
        };

        const id = await repo.saveLocation(payload);
        expect(id).toBeGreaterThan(0);

        const pending = await repo.getPendingLocation('123456');
        expect(pending).not.toBeNull();
        expect(pending?.token).toBe('test-token');
        expect(pending?.processed).toBe(false);
    });

    it('deve marcar localização como processada', async () => {
        const pending = await repo.getPendingLocation('123456');
        if (pending) {
            await repo.markAsProcessed(pending.id);
            const after = await repo.getPendingLocation('123456');
            expect(after).toBeNull();
        }
    });
});
