# Screen Sharing — WarriorBlack

## 🎯 Estado Atual

| Componente | Status |
|------------|--------|
| **Screen Server** | ✅ Funcionando na porta 3003 |
| **Comando `$screen`** | ✅ Integrado ao bot |
| **Build** | ✅ Compila para `dist/services/discord-screen/` |
| **Testes** | ✅ 139/139 tests passing |
| **Produção** | ⚠️ Requer variáveis de ambiente no servidor |

## 🚀 Como Funciona

### Arquitetura

```
WhatsApp/Discord
      ↓
   $screen command (src/bot/commands/screen.ts)
      ↓
   postJson() → HTTP para 127.0.0.1:3003
      ↓
   Screen Server (src/services/discord-screen/index.js)
      ├── /api/session-guest → Cria identidade de convidado
      ├── /api/rooms/create  → Cria sala com viewerToken + shareUrl
      └── WebSocket (ws://)   → Transmissão de tela em tempo real
```

### Fluxo do Comando `$screen`

1. **Bot recebe `$screen`** no WhatsApp/Discord
2. **Screen Server inicia** (se não estiver rodando) via `DiscordScreenService`
3. **Guest session criada** via `POST /api/session-guest`
4. **Sala criada** via `POST /api/rooms/create` com:
   - `shareUrl` — link para quem vai transmitir (broadcaster)
   - `viewerToken` — token para quem vai assistir (viewer)
5. **Bot responde** com dois links:
   - 🎥 **Transmitir**: `shareUrl` (abre no Chrome/Edge para capturar tela)
   - 👥 **Assistir**: `viewerLink` (link curto para compartilhar)

## 📋 Configuração Necessária para Produção

### Variáveis de Ambiente (no servidor Linux)

```bash
# Screen Server
DISCORD_SCREEN_PORT=3003
DISCORD_SCREEN_PUBLIC_ORIGIN=https://ubuntu.tail8486e7.ts.net

# Discord OAuth (opcional - para login dentro do Discord)
DISCORD_CLIENT_ID=seu_client_id
DISCORD_CLIENT_SECRET=seu_client_secret
DISCORD_BOT_TOKEN=seu_bot_token

# Segurança (obrigatório em produção)
SESSION_SECRET=uma_chave_aleatoria_de_32_caracteres

# Admin (opcional - para painel de administração)
DISCORD_ADMIN_ID=1307158493907652688
```

### Tailscale Funnel (para acesso externo)

```bash
# HTTPS → HTTP localhost:3003
tailscale funnel --bg 3003

# Resultado: https://ubuntu.tail8486e7.ts.net → http://127.0.0.1:3003
```

## 🛠️ Deploy no Servidor

### 1. Copiar arquivos

```bash
# No Windows
git add .
git commit -m "feat: screen sharing integrado"
git push origin main

# No servidor
cd /home/solanojr/bot-wpp
git pull
npm ci
npm run build
```

### 2. Configurar variáveis

```bash
nano .env
# Adicionar:
# DISCORD_SCREEN_PORT=3003
# DISCORD_SCREEN_PUBLIC_ORIGIN=https://ubuntu.tail8486e7.ts.net
# SESSION_SECRET=chave_aleatoria_segura
```

### 3. Iniciar

```bash
pm2 restart bot-wpp
# ou
pm2 start ecosystem.config.js
```

## 🧪 Testes

### Testar screen server diretamente

```bash
# Iniciar servidor
node dist/services/discord-screen/index.js

# Testar guest session
curl -X POST http://127.0.0.1:3003/api/session-guest \
  -H "Content-Type: application/json" \
  -d '{"name": "Teste"}'

# Testar criação de sala
curl -X POST http://127.0.0.1:3003/api/rooms/create \
  -H "Content-Type: application/json" \
  -d '{"identity": "...", "name": "Sala Teste"}'
```

### Testar comando $screen via testServer

```bash
curl -X POST http://127.0.0.1:3004/test \
  -d '{"platform":"whatsapp","command":"$screen"}'
```

## 📁 Estrutura de Arquivos

```
src/services/discord-screen/
├── index.js              # Servidor principal (Express + WebSocket)
├── tokens.js             # JWT tokens para salas
├── rooms.js              # Gerenciamento de salas
├── system.js             # Métricas de sistema
├── admin.js              # Painel administrativo
├── DiscordScreenService.ts  # Gerenciador do servidor (TypeScript)
├── public/               # Arquivos estáticos (share.html, admin.html, etc.)
├── client/               # Frontend Vite (broadcaster + viewer)
│   ├── src/              # Código fonte React/Vue
│   └── dist/             # Build de produção
└── shared/               # Código compartilhado
```

## ⚠️ Limitações Conhecidas

1. **Tailscale Funnel necessário** para acesso externo (WebCodecs exige HTTPS)
2. **Chrome/Edge recomendado** para broadcaster (WebCodecs API)
3. **Discord Activity** requer configuração no Developer Portal
4. **SESSION_SECRET obrigatório** em produção (tokens forjáveis sem ele)

## 🔄 Próximos Passos

- [ ] Configurar Tailscale Funnel no servidor
- [ ] Testar comando $screen no grupo "Teste"
- [ ] Validar fluxo completo: $screen → sala criada → transmissão
- [ ] Documentar troubleshooting de erros comuns
- [ ] Adicionar métricas de uso ao Prometheus
