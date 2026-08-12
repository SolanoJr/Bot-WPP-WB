import { describe, it, expect } from 'vitest';
import { CommandConfigService } from '../../src/services/commandConfigService';
import { PlatformType } from '../../src/platforms/base/PlatformTypes';

describe('CommandConfigService', () => {
  const service = new CommandConfigService();

  it('deve habilitar e desabilitar um comando por plataforma (async)', async () => {
    await service.setCommandEnabled('ping', 'whatsapp', true);
    await service.setCommandEnabled('ping', 'telegram', false);

    expect(await service.isCommandEnabled('ping', 'whatsapp' as PlatformType)).toBe(true);
    expect(await service.isCommandEnabled('ping', 'telegram' as PlatformType)).toBe(false);
  });

  it('retorna false por padrão (comandos começam desligados em grupos novos)', async () => {
    expect(await service.isCommandEnabled('unknown', 'whatsapp' as PlatformType)).toBe(false);
  });

  it('comandos de gestão (menu) ficam ligados por padrão', async () => {
    expect(await service.isCommandEnabled('menu', 'whatsapp' as PlatformType)).toBe(true);
  });
});
