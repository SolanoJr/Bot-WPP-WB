import { describe, expect, it, vi, beforeEach } from 'vitest';
import { registerUsage, getCommandUsage, getUserUsage, getTopUsers, resetUsage } from '../../src/services/usageService';

describe('usageService', () => {
  beforeEach(() => {
    resetUsage();
  });

  it('registra uso de comando', () => {
    registerUsage('ping', '558581344211@c.us');
    
    const commandStats = getCommandUsage();
    const userStats = getUserUsage();
    
    expect(commandStats['ping']).toBe(1);
    expect(userStats['558581344211@c.us']).toBe(1);
  });

  it('acumula múltiplos usos', () => {
    registerUsage('ping', '558581344211@c.us');
    registerUsage('ping', '558581344211@c.us');
    registerUsage('ping', '558581344212@c.us');
    
    const commandStats = getCommandUsage();
    
    expect(commandStats['ping']).toBe(3);
  });

  it('retorna usuários mais ativos', () => {
    registerUsage('ping', 'user1@c.us');
    registerUsage('ping', 'user1@c.us');
    registerUsage('ping', 'user1@c.us');
    registerUsage('ping', 'user2@c.us');
    registerUsage('ping', 'user2@c.us');
    registerUsage('ping', 'user3@c.us');
    
    const topUsers = getTopUsers(2);
    
    expect(topUsers).toHaveLength(2);
    expect(topUsers[0].userId).toBe('user1@c.us');
    expect(topUsers[0].count).toBe(3);
    expect(topUsers[1].userId).toBe('user2@c.us');
    expect(topUsers[1].count).toBe(2);
  });

  it('reseta estatísticas', () => {
    registerUsage('ping', '558581344211@c.us');
    resetUsage();
    
    const commandStats = getCommandUsage();
    const userStats = getUserUsage();
    
    expect(Object.keys(commandStats)).toHaveLength(0);
    expect(Object.keys(userStats)).toHaveLength(0);
  });

  it('lida com valores nulos', () => {
    registerUsage(null as any, null as any);
    
    const commandStats = getCommandUsage();
    const userStats = getUserUsage();
    
    expect(commandStats['desconhecido']).toBe(1);
    expect(userStats['usuario-desconhecido']).toBe(1);
  });
});
