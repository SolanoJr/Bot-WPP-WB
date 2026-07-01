import { describe, expect, it, vi } from 'vitest';
import { getSarcasticResponse } from '../../src/services/aiService';

describe('aiService', () => {
  it('retorna resposta sarcástica para interações', () => {
    const response = getSarcasticResponse();
    expect(typeof response).toBe('string');
    expect(response.length).toBeGreaterThan(0);
  });

  it('resposta sarcástica é uma string válida', () => {
    const response = getSarcasticResponse();
    expect(response).toBeTruthy();
    expect(typeof response).toBe('string');
    expect(response.length).toBeGreaterThan(0);
  });
});
