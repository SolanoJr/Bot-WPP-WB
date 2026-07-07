# Technology Stack: Bot-WPP

## Languages
- **TypeScript** (primary, `src/`) — strict mode, ESNext target, NodeNext module resolution
- **JavaScript** (legacy, `services/`, `relay/server.js`, scripts) — CommonJS
- **Python** (`gerador_qr.py`) — QR code generation utility
- **HTML/CSS** (`public/`) — Frontend GPS capture pages

## Runtime
- **Node.js** `>=20.x` (24.x recommended for production)
- **Module system**: CommonJS (`"type": "commonjs"` in package.json)

## Core Dependencies
| Package | Purpose |
|---|---|
| `whatsapp-web.js ^1.34.7` | WhatsApp Web client (Puppeteer-based) |
| `discord.js ^14.16.3` | Discord platform adapter |
| `telegraf ^4.16.3` | Telegram platform adapter |
| `express ^5.2.1` | Relay HTTP server |
| `axios ^1.15.2` | HTTP client (relay polling, external APIs) |
| `sqlite3 ^6.0.1` + `sqlite ^5.1.1` | Persistent storage |
| `lowdb ^7.0.1` | JSON file-based lightweight DB |
| `winston ^3.19.0` | Structured logging |
| `prom-client ^15.1.3` | Prometheus metrics |
| `dotenv ^17.4.2` | Environment variable loading |
| `cors ^2.8.6` | CORS middleware for relay |

## Dev Dependencies
| Package | Purpose |
|---|---|
| `typescript ^6.0.3` | TypeScript compiler |
| `tsup ^8.5.1` | Fast TypeScript bundler (build) |
| `tsx ^4.21.0` | TypeScript execution for dev |
| `vitest ^4.1.5` | Unit/integration test runner |
| `jest ^30.4.2` | Legacy test runner (scripts/) |
| `nodemon ^3.1.14` | Dev auto-reload |
| `ts-node ^10.9.2` | TypeScript REPL/execution |

## Build System
- **Bundler**: `tsup` — separate build targets per module group
- **Build commands**:
  - `npm run build` — full build (relay + services + bot + main + core)
  - `npm run build:relay` → `dist/relay/`
  - `npm run build:services` → `dist/services/`
  - `npm run build:bot` → `dist/bot/`
  - `npm run build:main` → `dist/`
  - `npm run build:core` → `dist/core/`
- **Output format**: CommonJS (`--format cjs`)

## TypeScript Configuration
- `strict: true`, `esModuleInterop: true`, `skipLibCheck: true`
- Path aliases: `@shared/*`, `@relay/*`, `@bot/*`
- Excludes: `node_modules`, `dist`, `**/*.test.ts`

## Development Commands
```bash
npm run dev:relay       # Start relay with hot-reload (tsx watch)
npm run bot:start       # Start bot from compiled dist
npm run build           # Full TypeScript build
npm test                # Run all tests (vitest)
npm run test:watch      # Vitest in watch mode
npm run test-commands   # Legacy command test script
```

## Production (PM2)
```bash
pm2 start ecosystem.config.js   # Start bot (runs dist/core/multiPlatform.js)
pm2 save                         # Persist process list
pm2 restart bot-wpp              # Restart after deploy
```

## Monitoring Stack
- **Prometheus** — metrics scraping (`prometheus.yml`)
- **Grafana** — dashboards (`grafana/dashboards/bot-wpp-overview.json`)
- **Alertmanager** — alert routing (`alertmanager.yml`)
- **Docker Compose** — local monitoring stack (`docker-compose.yml`)

## Deployment Targets
- **Bot**: Linux VPS (PM2 managed)
- **Relay**: Render (Pure JS, `relay/server.js`, `npm start`)
- **Frontend**: Cloudflare Pages (`public/location-pages/`)

## Environment Variables (`.env`)
```
MASTER_USER=<phone>@c.us
GEMINI_API_KEY=<key>
WARRIOR_AUTH_KEY=<16-char-key>
RELAY_URL=https://bot-wpp-relay.onrender.com
```
