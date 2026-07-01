import { describe, expect, it, vi } from 'vitest';
import { executeCommand } from '../../src/services/commandExecutor';

describe('commandExecutor', () => {
  it('executa comando com sucesso', async () => {
    const command = {
      name: 'test',
      execute: vi.fn().mockResolvedValue('success')
    };

    const context = {
      message: { from: '558581344211@c.us' },
      args: []
    };

    const result = await executeCommand(command, context);
    
    expect(result.success).toBe(true);
    expect(result.commandName).toBe('test');
    expect(result.value).toBe('success');
    expect(result.error).toBe(null);
  });

  it('usa nome padrão quando comando não tem nome', async () => {
    const command = {
      execute: vi.fn().mockResolvedValue('success')
    };

    const context = {
      message: { from: '558581344211@c.us' },
      args: []
    };

    const result = await executeCommand(command, context);
    
    expect(result.commandName).toBe('desconhecido');
  });
});
