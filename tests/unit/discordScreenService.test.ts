import { describe, it, expect, afterEach } from 'vitest';
import { createDiscordScreenServiceFromEnv } from '../../src/services/discord-screen/DiscordScreenService';

// Regressão (BUG 6/complemento): o bot NUNCA deve gerar um segundo processo do
// screen quando um supervisor externo (PM2) já é o dono — o filho morria com
// EADDRINUSE e o "assuming ready" mascarava a falha.
const CHAVES = [
  'DISCORD_CLIENT_ID',
  'DISCORD_CLIENT_SECRET',
  'DISCORD_BOT_TOKEN',
  'DISCORD_SCREEN_EXTERNAL',
  'DISCORD_SCREEN_PORT',
  'DISCORD_SCREEN_PUBLIC_ORIGIN',
];

const snapshot = () => Object.fromEntries(CHAVES.map((k) => [k, process.env[k]]));
const restore = (s: Record<string, string | undefined>) => {
  for (const k of CHAVES) {
    if (s[k] === undefined) delete process.env[k];
    else process.env[k] = s[k];
  }
};

const comCredenciais = () => {
  process.env.DISCORD_CLIENT_ID = 'id-teste';
  process.env.DISCORD_CLIENT_SECRET = 'secret-teste';
  process.env.DISCORD_BOT_TOKEN = 'token-teste';
};

describe('DiscordScreenService (factory)', () => {
  const antes = snapshot();
  afterEach(() => restore(antes));

  it('retorna null sem credenciais', () => {
    delete process.env.DISCORD_CLIENT_ID;
    delete process.env.DISCORD_CLIENT_SECRET;
    delete process.env.DISCORD_BOT_TOKEN;
    expect(createDiscordScreenServiceFromEnv()).toBeNull();
  });

  it('retorna null com DISCORD_SCREEN_EXTERNAL=true mesmo com credenciais', () => {
    comCredenciais();
    process.env.DISCORD_SCREEN_EXTERNAL = 'true';
    expect(createDiscordScreenServiceFromEnv()).toBeNull();
  });

  it('retorna null com DISCORD_SCREEN_EXTERNAL=1', () => {
    comCredenciais();
    process.env.DISCORD_SCREEN_EXTERNAL = '1';
    expect(createDiscordScreenServiceFromEnv()).toBeNull();
  });

  it('cria o serviço com credenciais e sem flag externa (modo dev)', () => {
    comCredenciais();
    delete process.env.DISCORD_SCREEN_EXTERNAL;
    delete process.env.DISCORD_SCREEN_PORT;
    const svc = createDiscordScreenServiceFromEnv();
    expect(svc).not.toBeNull();
    expect(svc!.getStatus()).toMatchObject({ running: false, port: 3002 });
  });
});
