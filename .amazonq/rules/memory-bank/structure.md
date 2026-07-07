# Project Structure: Bot-WPP

## Directory Layout

```
bot-wpp/
├── src/                        # TypeScript source (primary codebase)
│   ├── whatsapp.ts             # Main entry point: WhatsApp client init & event wiring
│   ├── bot/                    # Bot logic layer
│   │   ├── index.ts            # Command loader and registry
│   │   ├── config.ts           # Bot-level configuration
│   │   ├── customCommands.ts   # Runtime custom command management
│   │   ├── relayClient.ts      # HTTP client for relay service
│   │   └── commands/           # Individual command modules (40+ files)
│   │       ├── index.ts        # Command map export
│   │       ├── types.ts        # Shared command type definitions
│   │       └── *.ts            # One file per command
│   ├── services/               # Business logic services
│   │   ├── messageHandler.ts   # Central message routing
│   │   ├── moderationService.ts# Content moderation (links, bets, spam)
│   │   ├── keywordHandler.ts   # Keyword-based auto-responses
│   │   ├── aiService.ts        # Gemini API integration
│   │   ├── commandExecutor.ts  # Command dispatch and execution
│   │   ├── databaseService.ts  # SQLite database access
│   │   ├── loggerService.ts    # Winston logger setup
│   │   ├── queueService.ts     # Message queue management
│   │   ├── permissions.ts      # Role/permission checks
│   │   ├── usageService.ts     # Command usage tracking
│   │   ├── replyService.ts     # Reply formatting helpers
│   │   ├── rateLimiter.ts      # Rate limiting logic
│   │   ├── metricsService.ts   # Prometheus metrics
│   │   ├── autoModService.ts   # Automated moderation rules
│   │   ├── validationService.ts# Input validation
│   │   ├── commandConfigService.ts # Per-command config persistence
│   │   └── whatsappSingleton.ts# WhatsApp client singleton
│   ├── platforms/              # Multi-platform adapter layer
│   │   ├── PlatformManager.ts  # Platform registry and routing
│   │   ├── base/PlatformTypes.ts # Shared platform interfaces
│   │   ├── whatsapp/           # WhatsApp adapter
│   │   ├── discord/            # Discord adapter
│   │   └── telegram/           # Telegram adapter
│   ├── relay/                  # Relay server (deployed to Render)
│   │   ├── server.ts           # Express HTTP server
│   │   └── repositories/storage.repository.ts # In-memory storage
│   ├── core/                   # Multi-platform entry point
│   │   ├── index.ts            # Core bootstrap
│   │   └── multiPlatform.ts    # Platform orchestration
│   ├── shared/types.ts         # Global shared types
│   └── utils/validator.ts      # Input validation utilities
├── relay/                      # Standalone relay (Pure JS, for Render deploy)
│   └── server.js               # No native deps, in-memory only
├── services/                   # Legacy JS services (pre-TypeScript migration)
├── tests/                      # Test suite
│   ├── unit/                   # Unit tests per service/command
│   ├── integration/            # Integration tests (relay, full command flow)
│   └── setup.ts                # Vitest global setup
├── scripts/                    # Tooling and automation scripts
│   ├── tests/                  # Legacy JS test scripts
│   └── tools/                  # Deploy, QR extraction, diagnostics
├── public/                     # Frontend HTML pages (Cloudflare Pages)
│   └── location-pages/index.html # GPS capture page
├── docs/                       # Project documentation
├── grafana/                    # Grafana dashboard configs
├── data/                       # Runtime data (SQLite DB, users.json)
├── logs/                       # Winston log output
├── .env                        # Environment variables (not committed)
├── ecosystem.config.js         # PM2 process config
├── docker-compose.yml          # Docker setup (monitoring stack)
├── prometheus.yml              # Prometheus scrape config
└── tsconfig.json               # TypeScript compiler config
```

## Core Components and Relationships

```
WhatsApp Client (whatsapp.ts)
    └── messageHandler.ts          ← central router
            ├── moderationService  ← intercepts non-commands
            ├── keywordHandler     ← intercepts non-commands
            └── commandExecutor    ← dispatches $commands
                    ├── commands/index.ts  ← local command map
                    └── relayClient.ts     ← fallback: custom commands from relay
```

## Architectural Patterns

- **Command Pattern**: Each command is a module exporting a handler function; all registered in a central map (`src/bot/commands/index.ts`).
- **Adapter Pattern**: Platform adapters (WhatsApp, Discord, Telegram) implement a common interface via `PlatformManager`.
- **Singleton**: WhatsApp client exposed as a singleton (`whatsappSingleton.ts`).
- **Repository Pattern**: Relay storage abstracted behind `storage.repository.ts`.
- **Distributed Architecture**: Bot (VPS) ↔ Relay (Render) ↔ Frontend (Cloudflare Pages) communicate via authenticated HTTP.
- **In-Memory Relay**: Relay uses pure JS in-memory storage to avoid native dependency issues on Render's GLIBC environment.
- **Dual Codebase**: `src/` (TypeScript, primary) and `services/` (legacy JS, kept for reference/fallback).
