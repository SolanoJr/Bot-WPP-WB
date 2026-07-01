/**
 * Sistema de antispam local (substitui o antispam.js do astabot).
 * Controla rate limiting por usuário (5 segundos entre comandos).
 */

interface UserFilter {
  lastCommand: number;
  count: number;
}

const userFilters: Map<string, UserFilter> = new Map();
const COOLDOWN_MS = 5000; // 5 segundos

export function isFiltered(userId: string): boolean {
  const now = Date.now();
  const filter = userFilters.get(userId);
  
  if (!filter) {
    // Primeira vez - permite
    userFilters.set(userId, { lastCommand: now, count: 1 });
    return true;
  }
  
  const timeSinceLastCommand = now - filter.lastCommand;
  
  if (timeSinceLastCommand >= COOLDOWN_MS) {
    // Passou tempo suficiente - reseta contador e permite
    userFilters.set(userId, { lastCommand: now, count: 1 });
    return true;
  }
  
  // Ainda no cooldown
  filter.count += 1;
  filter.lastCommand = now;
  return false;
}

export function addFilter(userId: string): void {
  const now = Date.now();
  userFilters.set(userId, { lastCommand: now, count: 1 });
}

export function getFilterStatus(userId: string): { allowed: boolean; remainingMs: number } {
  const now = Date.now();
  const filter = userFilters.get(userId);
  
  if (!filter) {
    return { allowed: true, remainingMs: 0 };
  }
  
  const timeSinceLastCommand = now - filter.lastCommand;
  
  if (timeSinceLastCommand >= COOLDOWN_MS) {
    return { allowed: true, remainingMs: 0 };
  }
  
  return { allowed: false, remainingMs: COOLDOWN_MS - timeSinceLastCommand };
}

export function clearFilter(userId: string): void {
  userFilters.delete(userId);
}

export function clearAllFilters(): void {
  userFilters.clear();
}