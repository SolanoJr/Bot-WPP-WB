import { describe, expect, it } from 'vitest';
import { isValidCommand } from '../../src/utils/validator';

describe('validator utility', () => {
  it('verifica se texto é comando válido com prefixo $', () => {
    process.env.COMMAND_PREFIX = '$';
    expect(isValidCommand('$ping')).toBe(true);
    expect(isValidCommand('$menu')).toBe(true);
    expect(isValidCommand('$help')).toBe(true);
  });

  it('verifica se texto é comando válido com prefixo !', () => {
    process.env.COMMAND_PREFIX = '!';
    expect(isValidCommand('!ping')).toBe(true);
    expect(isValidCommand('!menu')).toBe(true);
    expect(isValidCommand('!help')).toBe(true);
  });

  it('aceita ambos os prefixos alternativos', () => {
    process.env.COMMAND_PREFIX = '$';
    expect(isValidCommand('$ping')).toBe(true);
    expect(isValidCommand('!ping')).toBe(true); // prefixo alternativo
  });

  it('rejeita textos sem prefixo de comando', () => {
    process.env.COMMAND_PREFIX = '$';
    expect(isValidCommand('ping')).toBe(false);
    expect(isValidCommand('menu')).toBe(false);
    expect(isValidCommand('texto normal')).toBe(false);
  });

  it('rejeita strings vazias', () => {
    process.env.COMMAND_PREFIX = '$';
    expect(isValidCommand('')).toBe(false);
    expect(isValidCommand(' ')).toBe(false);
  });
});
