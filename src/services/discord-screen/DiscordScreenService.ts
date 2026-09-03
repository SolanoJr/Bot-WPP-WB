// src/services/discord-screen/DiscordScreenService.ts
// Gerencia o servidor de Discord Screen Sharing como processo filho

import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';

export interface DiscordScreenConfig {
  port: number;
  publicOrigin: string;
  discordClientId: string;
  discordClientSecret: string;
  discordBotToken: string;
  discordAdminIds?: string[];
  turnUrl?: string;
  turnUser?: string;
  turnPass?: string;
  sessionSecret?: string;
  nodeEnv: string;
}

export class DiscordScreenService {
  private process: ChildProcess | null = null;
  private config: DiscordScreenConfig;
  private isRunning = false;
  private startPromise: Promise<void> | null = null;

  constructor(config: DiscordScreenConfig) {
    this.config = config;
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[DiscordScreenService] Already running');
      return;
    }
    if (this.startPromise) {
      return this.startPromise;
    }
    this.startPromise = this.doStart();
    return this.startPromise;
  }

  private async doStart(): Promise<void> {
    return new Promise((resolve, reject) => {
      const env = {
        ...process.env,
        PORT: String(this.config.port),
        PUBLIC_ORIGIN: this.config.publicOrigin,
        DISCORD_CLIENT_ID: this.config.discordClientId,
        DISCORD_CLIENT_SECRET: this.config.discordClientSecret,
        DISCORD_BOT_TOKEN: this.config.discordBotToken,
        DISCORD_ADMIN_ID: this.config.discordAdminIds?.join(',') || '',
        TURN_URL: this.config.turnUrl || '',
        TURN_USER: this.config.turnUser || '',
        TURN_PASS: this.config.turnPass || '',
        SESSION_SECRET: this.config.sessionSecret || '',
        NODE_ENV: this.config.nodeEnv,
      };

      const projectRoot = process.env.PWD || process.cwd();
      const serverPath = path.join(projectRoot, 'discord-screen', 'server', 'index.js');
      const clientDist = path.join(projectRoot, 'discord-screen', 'client', 'dist');
      const hasClientBuild = fs.existsSync(path.join(clientDist, 'index.html'));

      if (!hasClientBuild && this.config.nodeEnv === 'production') {
        console.warn('[DiscordScreenService] Client build not found at', clientDist);
        console.warn('[DiscordScreenService] Run "npm run screen:build" to build the client');
      }

      console.log('[DiscordScreenService] Starting server on port', this.config.port);
      console.log('[DiscordScreenService] Public origin:', this.config.publicOrigin);

      const workingDir = path.join(projectRoot, 'discord-screen');

      this.process = spawn('node', [serverPath], {
        env,
        cwd: workingDir,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      this.process.stdout?.on('data', (data) => {
        const output = data.toString().trim();
        if (output) console.log(`[DiscordScreen] ${output}`);
      });

      this.process.stderr?.on('data', (data) => {
        const output = data.toString().trim();
        if (output) console.error(`[DiscordScreen] ${output}`);
      });

      this.process.on('error', (err) => {
        console.error('[DiscordScreenService] Failed to start:', err);
        this.isRunning = false;
        this.startPromise = null;
        reject(err);
      });

      this.process.on('exit', (code, signal) => {
        console.log(`[DiscordScreenService] Process exited with code ${code}, signal ${signal}`);
        this.isRunning = false;
        this.process = null;
        this.startPromise = null;
        if (code !== 0 && code !== null) {
          reject(new Error(`Process exited with code ${code}`));
        }
      });

      const readyTimeout = setTimeout(async () => {
        // Sem sinal de ready em 10s: não presumir nada — perguntar ao server.
        try {
          const res = await fetch(`http://127.0.0.1:${this.config.port}/api/health`);
          if (res.ok) {
            console.log('[DiscordScreenService] Server respondeu /api/health — pronto');
            this.isRunning = true;
            resolve();
            return;
          }
          throw new Error(`health check HTTP ${res.status}`);
        } catch (err) {
          this.startPromise = null;
          reject(new Error(`[DiscordScreenService] Server não respondeu em 10s na porta ${this.config.port}: ${(err as Error).message}`));
        }
      }, 10000);

      this.process.stdout?.on('data', (data) => {
        const output = data.toString();
        if (output.includes('no ar em') || output.includes('Sala de Tela no ar')) {
          clearTimeout(readyTimeout);
          this.isRunning = true;
          resolve();
        }
      });
    });
  }

  async stop(): Promise<void> {
    if (!this.process || !this.isRunning) {
      console.log('[DiscordScreenService] Not running');
      return;
    }
    console.log('[DiscordScreenService] Stopping...');
    return new Promise((resolve) => {
      const forceKillTimeout = setTimeout(() => {
        if (this.process) {
          console.log('[DiscordScreenService] Force killing...');
          this.process.kill('SIGKILL');
        }
        resolve();
      }, 5000);

      this.process?.on('exit', () => {
        clearTimeout(forceKillTimeout);
        this.isRunning = false;
        this.process = null;
        this.startPromise = null;
        console.log('[DiscordScreenService] Stopped');
        resolve();
      });

      this.process?.kill('SIGTERM');
    });
  }

  getStatus(): { running: boolean; port: number; publicOrigin: string } {
    return {
      running: this.isRunning,
      port: this.config.port,
      publicOrigin: this.config.publicOrigin,
    };
  }

  getBaseUrl(): string {
    return this.config.publicOrigin;
  }

  getWsUrl(): string {
    const url = new URL(this.config.publicOrigin);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.port = String(this.config.port);
    return url.toString();
  }
}

export function createDiscordScreenServiceFromEnv(): DiscordScreenService | null {
  const {
    DISCORD_CLIENT_ID,
    DISCORD_CLIENT_SECRET,
    DISCORD_BOT_TOKEN,
    DISCORD_ADMIN_ID,
    DISCORD_SCREEN_PORT = '3002',
    DISCORD_SCREEN_PUBLIC_ORIGIN,
    DISCORD_SCREEN_EXTERNAL = '',
    TURN_URL,
    TURN_USER,
    TURN_PASS,
    SESSION_SECRET,
    NODE_ENV = 'development',
  } = process.env;

  // Um dono só para o server: quando o PM2 (ou outro supervisor) já sobe o
  // discord-screen, o bot NÃO deve gerar um segundo processo filho na mesma
  // porta — o filho morreria com EADDRINUSE e o "assuming ready" mascarava isso.
  if (DISCORD_SCREEN_EXTERNAL === '1' || DISCORD_SCREEN_EXTERNAL.toLowerCase() === 'true') {
    console.log('[DiscordScreenService] Gerenciado externamente (DISCORD_SCREEN_EXTERNAL) — spawn interno desativado');
    return null;
  }

  if (!DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET || !DISCORD_BOT_TOKEN) {
    console.log('[DiscordScreenService] Missing required Discord credentials, screen sharing disabled');
    return null;
  }

  const adminIds = DISCORD_ADMIN_ID
    ? String(DISCORD_ADMIN_ID).split(/[,\\s;]+/).filter(Boolean)
    : [];

  const publicOrigin = DISCORD_SCREEN_PUBLIC_ORIGIN || `http://localhost:${DISCORD_SCREEN_PORT}`;

  const config: DiscordScreenConfig = {
    port: parseInt(DISCORD_SCREEN_PORT, 10),
    publicOrigin,
    discordClientId: DISCORD_CLIENT_ID,
    discordClientSecret: DISCORD_CLIENT_SECRET,
    discordBotToken: DISCORD_BOT_TOKEN,
    discordAdminIds: adminIds.length > 0 ? adminIds : undefined,
    turnUrl: TURN_URL,
    turnUser: TURN_USER,
    turnPass: TURN_PASS,
    sessionSecret: SESSION_SECRET,
    nodeEnv: NODE_ENV,
  };

  return new DiscordScreenService(config);
}

export default DiscordScreenService;
