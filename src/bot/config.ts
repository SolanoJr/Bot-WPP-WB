import { WarriorKey } from '../shared/types.js';

// Import adapters so they register themselves via side‑effects
// Removed side-effect imports of adapters to avoid unnecessary initialization during config loading.
// Platform adapters are imported where needed, not here.


export const WARRIOR_AUTH_KEY_LENGTH = 16;

export interface IBotConfig {
    warriorAuthKey: WarriorKey;
    relayUrl: string;
    commandPrefix: string;
    masterUser?: string;
    geminiApiKey?: string;
}

export function validateWarriorAuthKey(value: string | undefined, variableName = 'WARRIOR_AUTH_KEY'): WarriorKey {
    const key = String(value || '').trim();

    if (key.length !== WARRIOR_AUTH_KEY_LENGTH) {
        throw new Error(
            `${variableName} invalida: esperado exatamente ${WARRIOR_AUTH_KEY_LENGTH} caracteres, recebido ${key.length}.`
        );
    }

    return key as WarriorKey;
}

export function loadBotConfig(env: NodeJS.ProcessEnv = process.env): IBotConfig {
    const warriorAuthKey = validateWarriorAuthKey(env.WARRIOR_AUTH_KEY);

    return {
        warriorAuthKey,
        relayUrl: (env.RELAY_URL || 'https://bot-wpp-relay.onrender.com').trim(),
        commandPrefix: (env.COMMAND_PREFIX || '$').trim(),
        masterUser: env.MASTER_USER,
        geminiApiKey: env.GEMINI_API_KEY,
    };
}

export function loadBotConfigOrExit(env: NodeJS.ProcessEnv = process.env): IBotConfig {
    try {
        return loadBotConfig(env);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[BOT-CONFIG] ${message}`);
        console.error('[BOT-CONFIG] Corrija a WARRIOR_AUTH_KEY no ambiente/.env antes de iniciar o Bot.');
        process.exit(1);
    }
}
