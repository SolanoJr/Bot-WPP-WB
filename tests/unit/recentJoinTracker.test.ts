/**
 * INC-008 — testes do recentJoinTracker (combo especial do antibot).
 * Módulo puro em memória: sem DB, sem mocks — tempo injetável.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  markRecentJoin,
  consumeFirstMessage,
  isRecentJoin,
  clearRecentJoins,
} from '../../src/services/recentJoinTracker';

const G1 = '120363410094452673@g.us'; // lab
const G2 = '120363419033272638@g.us'; // Figurinhas — nunca tocar
const U = '5511999999999@c.us';

describe('INC-008 — recentJoinTracker (combo antibot)', () => {
  beforeEach(() => {
    clearRecentJoins();
  });

  it('sem mark → consumeFirstMessage retorna false', () => {
    expect(consumeFirstMessage(G1, U)).toBe(false);
  });

  it('após mark → consume true na 1ª mensagem e false na 2ª (consumo destrutivo)', () => {
    markRecentJoin(G1, U);
    expect(consumeFirstMessage(G1, U)).toBe(true);
    expect(consumeFirstMessage(G1, U)).toBe(false);
  });

  it('fora da janela (3 min) → false e limpa a marca', () => {
    const t0 = Date.now();
    markRecentJoin(G1, U, t0 - 3 * 60 * 1000);
    expect(consumeFirstMessage(G1, U, t0)).toBe(false);
    expect(isRecentJoin(G1, U, t0)).toBe(false);
  });

  it('dentro da janela (1 min) → true', () => {
    const t0 = Date.now();
    markRecentJoin(G1, U, t0 - 60 * 1000);
    expect(isRecentJoin(G1, U, t0)).toBe(true);
    expect(consumeFirstMessage(G1, U, t0)).toBe(true);
  });

  it('chave composta por grupo: marca em G1 não vaza para G2', () => {
    markRecentJoin(G1, U);
    expect(consumeFirstMessage(G2, U)).toBe(false);
    expect(consumeFirstMessage(G1, U)).toBe(true);
  });
});
