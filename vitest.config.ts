import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Incluir apenas arquivos de teste TypeScript em tests/
    include: ['tests/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.git/**', '**/temp/**'],
    setupFiles: ['./tests/setup.ts'],
    globals: true,
    isolate: true,
    testTimeout: 10000,
    // Mockar módulos problemáticos globalmente antes de qualquer import
    server: {
      deps: {
        // Forçar transformação de módulos que usam dotenv no nível de módulo
        inline: ['dotenv'],
      },
    },
    env: {
      NODE_ENV: 'test',
      TELEGRAM_BOT_TOKEN: 'test-telegram-token',
      DISCORD_BOT_TOKEN: 'test-discord-token',
      GEMINI_API_KEY: 'test-gemini-api-key',
      WARRIOR_AUTH_KEY: '1234567890123456',
      COMMAND_PREFIX: '$',
      RELAY_URL: 'http://relay.test',
      MASTER_USER: '5588998314322@c.us',
      MASTER_NUMBER: '5588998314322',
      ADMINS: '',
    },
  },
});
