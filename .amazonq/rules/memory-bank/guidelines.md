# Development Guidelines: Bot-WPP

## Code Quality Standards

### TypeScript Conventions
- **Strict mode** is enabled — always provide explicit types for function parameters and return values.
- Use `interface` for object shapes (e.g., `MessageData`, `QueueStats`, `ICommand`), `type` for unions and aliases.
- Prefer `async/await` over `.then()` chains throughout the codebase.
- Always type `catch` error blocks as `error: any` (project standard) and access `.message` for logging.
- Use `Map<K, V>` for in-memory registries and state stores (e.g., `votes`, `adapters`, `commandRegistry`).

### Naming Conventions
- **Classes**: PascalCase — `PlatformManager`, `WhatsAppAdapter`
- **Functions/methods**: camelCase — `enqueueMessage`, `registerAdapter`, `handleIncomingMessage`
- **Constants**: UPPER_SNAKE_CASE for module-level config — `QUEUE_FILE`, `LOG_DIR`, `WARRIOR_AUTH_KEY`
- **Interfaces**: PascalCase prefixed with `I` for command interfaces — `ICommand`, `ILegacyCommand`; plain PascalCase for data shapes — `MessageData`, `QueueStats`
- **Files**: camelCase for services/utilities (`queueService.ts`, `loggerService.ts`), PascalCase for classes (`PlatformManager.ts`)

### File Header Comments
Every service/class file starts with a JSDoc-style block comment describing purpose:
```ts
/**
 * 🔒 WarriorBlack - Platform Manager
 *
 * Orquestrador singleton para gerenciar múltiplas plataformas (WhatsApp, Telegram, Discord)
 */
```
Use emoji prefixes in block comments for visual scanning (🔒, 📋, ✅, ❌, 📥, 📤).

### Inline Comments
- Use Portuguese for inline comments and log messages (project language).
- Use emoji prefixes in `console.log` for log level clarity:
  - `✅` success, `❌` error, `⚠️` warning, `📥` input, `📤` output, `📊` stats, `🧹` cleanup

---

## Architectural Patterns

### Singleton Pattern
Used for shared stateful services. Always expose via a module-level exported instance:
```ts
export class PlatformManager {
  private static instance: PlatformManager;
  private constructor() {}
  static getInstance(): PlatformManager {
    if (!PlatformManager.instance) PlatformManager.instance = new PlatformManager();
    return PlatformManager.instance;
  }
}
export const platformManager = PlatformManager.getInstance();
```
Also used in: `whatsappSingleton.ts`, `loggerService.ts`.

### Command Pattern
Each command is a module exporting an object or functions conforming to `ICommand`:
```ts
export interface ICommand {
  name: string;
  description: string;
  platforms?: PlatformType[];   // undefined = all platforms
  execute(ctx: CommandContext): Promise<void> | void;
}
```
- All commands registered in `src/bot/commands/index.ts` as a `Map<string, ICommand>`.
- Legacy commands use `LegacyCommandExecute = (msg, client, args) => Promise<void>`.
- New commands MUST use `CommandContext` from `PlatformTypes`.

### Adapter Pattern
Platform adapters implement a common interface. New platforms must implement `PlatformAdapter` and `PlatformClient` from `src/platforms/base/PlatformTypes.ts`, then register with `PlatformManager.registerAdapter()`.

### Service Module Pattern (queueService, loggerService)
Stateless utility services export named functions (not classes):
```ts
export { enqueueMessage, getNextMessage, markAsProcessed, cleanupOldMessages, getQueueStats };
```
Internal helpers are unexported (e.g., `ensureQueueFile`, `generateMessageId`).

### Error Handling Pattern
All async operations wrap in try/catch. Errors are logged but never crash the process — operations continue gracefully:
```ts
try {
  await adapter.initialize();
} catch (error) {
  console.error(`[PlatformManager] ❌ Falha ao iniciar ${platform}:`, error);
  // Continua com as outras plataformas
}
```
Critical services (logging, DB writes) silently fail without propagating to callers.

### Dynamic Import for Circular Dependency Avoidance
When a service needs another service that would create a circular dependency, use dynamic import:
```ts
const { getDb } = await import('../services/databaseService');
```

---

## Message Processing Pipeline

The central routing order in `messageHandler.ts` is:
1. Check if message starts with `$` (command prefix).
2. If NOT a command → run `moderationService` → run `keywordHandler`.
3. If IS a command → skip moderation/keyword checks → run `commandExecutor`.
4. If command not found locally → fallback to relay custom commands.

**Critical rule**: Commands (starting with `$`) MUST bypass moderation and keyword checks.

---

## Command Development

### Adding a New Command
1. Create `src/bot/commands/<name>.ts` exporting an `ICommand` object.
2. Register it in `src/bot/commands/index.ts`.
3. Use `ctx.reply()` for group responses, `ctx.replyPrivate()` for DMs.
4. Check permissions via `ctx.isMaster` / `ctx.isAdmin` before privileged actions.

### Command Context Usage
```ts
async execute(ctx: CommandContext): Promise<void> {
  const { args, reply, userId, isAdmin } = ctx;
  if (!isAdmin) { await reply('⚠️ Sem permissão.'); return; }
  await reply(`✅ Executado por ${userId}`);
}
```

### In-Memory State for Commands
Use module-level `Map` for command state (e.g., active votes, game state):
```ts
const votes: Map<string, Vote> = new Map();
```
State is lost on restart — use `databaseService` for persistence.

---

## Logging Standards

Always use the Winston logger from `loggerService.ts` for persistent logs:
```ts
import logger from '../services/loggerService';
logger.info('Mensagem informativa');
logger.error('Erro crítico');
```
Use `console.log` with emoji prefixes for operational/debug output (visible in PM2 logs).
Log format: `YYYY-MM-DD HH:mm:ss [LEVEL]: message`

---

## Security Patterns

- All relay endpoints authenticated via `x-api-key` header using `WARRIOR_AUTH_KEY`.
- Rate limiting applied per `userId` before command execution (via `rateLimiter.checkLimit()`).
- Platform IDs normalized with prefixes (`wpp:`, `tg:`, `dc:`) to prevent cross-platform ID collisions.
- Strip platform prefixes before DB writes: `userId.replace(/^(wpp:|tg:|dc:)/, '')`.
- Never log or expose `WARRIOR_AUTH_KEY` or `GEMINI_API_KEY` in output.

---

## Testing Conventions

- Test runner: **Vitest** (`npm test`), config in `vitest.config.ts`.
- Test files: `*.test.ts` in `tests/unit/` or `tests/integration/`.
- Global setup: `tests/setup.ts`.
- Test files are excluded from TypeScript compilation (`tsconfig.json`).
- Legacy JS tests in `scripts/tests/` use Jest.

---

## Build & Deploy Checklist

1. Run `npm run build` — verify no TypeScript errors.
2. Test with `npm test`.
3. On VPS: `pm2 restart bot-wpp` after pulling changes.
4. Relay deploys automatically on Render from `relay/server.js` (Pure JS, no build step).
5. Frontend deploys to Cloudflare Pages from `public/location-pages/`.
