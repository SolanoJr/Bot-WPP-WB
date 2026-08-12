import { describe, it, expect } from 'vitest';
import { CommandConfigService } from '../../src/services/commandConfigService';
import { PlatformType } from '../../src/platforms/base/PlatformTypes';


describe('CommandConfigService', () => {
  const service = new CommandConfigService();

  it('deve habilitar e desabilitar um comando por plataforma', () => {
    service.setCommandEnabled('ping', 'whatsapp', true);
    service.setCommandEnabled('ping', 'telegram', false);

    expect(service.isCommandEnabled('ping', 'whatsapp' as PlatformType)).toBe(true);
    expect(service.isCommandEnabled('ping', 'telegram' as PlatformType)).toBe(false);
  });

  it('retorna true por padrão quando o comando não foi configurado', () => {
    expect(service.isCommandEnabled('unknown', 'whatsapp' as PlatformType)).toBe(true);
  });
});
