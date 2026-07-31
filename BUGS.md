# BUGS.md - Registro Operacional

Este arquivo resume bugs ativos ou riscos operacionais que precisam de acompanhamento. O histórico detalhado existente continua em `docs/BUG_TRACKER.md`.

## 2026-07-31 - Sessão de correção e sincronização

### WhatsApp ProtocolError - RESOLVIDO
- **Problema:** ProtocolError no Puppeteer ao inicializar WhatsApp (Target closed)
- **Causa:** webVersionCache fixo causando incompatibilidade com versão atual do WhatsApp Web
- **Solução aplicada:** Removido webVersionCache e ajustadas flags Puppeteer (--disable-web-security, --disable-features=VizDisplayCompositor, --disable-extensions, remoção de --single-process)
- **Arquivos afetados:** `src/platforms/whatsapp/WhatsAppAdapter.ts`
- **Status:** Resolvido em 2026-07-31 - QR Code gerado com sucesso

### Telegram 401 - PARCIALMENTE RESOLVIDO
- **Problema:** Telegram falha na inicialização com 401: Unauthorized
- **Causa:** Token inválido no .env do Linux
- **Solução aplicada:** Token atualizado para o valor correto das credenciais
- **Status:** Ainda falhando após atualização - token pode estar revogado. Requer ação manual no BotFather.

### Sincronização Git - RESOLVIDO
- **Problema:** Arquivo `src/core/multiPlatform.ts` não rastreado no Windows
- **Solução aplicada:** Commit e push para origin/main, sync com Linux
- **Arquivos afetados:** Git (Windows, GitHub, Linux)
- **Status:** Resolvido em 2026-07-31 - todos ambientes sincronizados no commit 389f667

### Limpeza de ambiente - RESOLVIDO
- **Problema:** Core dump de 53MB no Linux, worktrees prunable
- **Solução aplicada:** Remoção de core.* e git worktree prune
- **Arquivos afetados:** Ambiente Linux, Git
- **Status:** Resolvido em 2026-07-31

## 2026-07-31 - Produção divergente e reiniciando

- **Problema:** O servidor Linux de produção estava divergente do GitHub (`ahead 4, behind 68`) e possuía arquivos não rastreados (`test-env.js`, `test-pm2-env.js`).
- **Causa provável:** Alterações/deploys diretos em produção sem sincronização completa com GitHub.
- **Solução aplicada:** Commits locais preservados em `backup/linux-local-20260731`; produção resetada para `origin/main` (`4fe8396`); artefatos temporários removidos.
- **Arquivos afetados:** Ambiente Linux `/home/solanojr/bot-wpp`, Git.
- **Status:** Resolvido em 2026-07-31.

## 2026-07-31 - Falha de inicialização no WhatsApp Web em produção

- **Problema:** PM2 acumulou ~7039 restarts; Puppeteer falhava com `net::ERR_NAME_NOT_RESOLVED`.
- **Causa raiz:** Tailscale DNS (`100.100.100.100`) ativo sem resolvers upstream configurados; resolução externa retornava `SERVFAIL`.
- **Solução aplicada:** `sudo tailscale set --accept-dns=false` + resolvers `8.8.8.8`/`1.1.1.1`; limpeza de journals PM2 (~2.9 GB); redeploy com `multiPlatform`.
- **Validação:** PM2 online com 0 restarts; WhatsApp e Discord inicializados; `web.whatsapp.com` responde HTTP 200.
- **Arquivos afetados:** Ambiente Linux, PM2, DNS/Tailscale.
- **Status:** Resolvido em 2026-07-31.

## 2026-07-31 - Telegram 401 em produção

- **Problema:** Telegram falha na inicialização com `401: Unauthorized` após recuperação do servidor.
- **Causa provável:** `TELEGRAM_BOT_TOKEN` inválido, revogado ou divergente do `.env` de produção.
- **Impacto:** Telegram indisponível; WhatsApp e Discord continuam operacionais.
- **Solução recomendada:** Rotacionar token no BotFather, atualizar `.env` do Linux e reiniciar PM2.
- **Arquivos afetados:** `.env` (Linux), `src/platforms/telegram/TelegramAdapter.ts`.
- **Status:** Aberto.

## 2026-07-31 - Migração multiPlatform incompleta

- **Problema:** `preFlightCheck()`, métricas Prometheus e polling de `/ondeestou` existiam apenas em `whatsapp.ts`.
- **Solução aplicada:** Extraídos para `src/core/bootServices.ts` e integrados em `multiPlatform.ts` (métricas, preflight, location polling via `platformManager`).
- **Arquivos afetados:** `src/core/bootServices.ts`, `src/core/multiPlatform.ts`.
- **Status:** Resolvido em 2026-07-31 (pendente commit/push para GitHub).

## 2026-07-31 - Vulnerabilidades em dependências

- **Problema:** `npm audit` reportou 8 vulnerabilidades, incluindo 1 crítica.
- **Causa:** Dependências transitivas vulneráveis em pacotes como `tar`, `undici`, `brace-expansion`, `js-yaml`, `postcss` e `esbuild`.
- **Impacto:** Risco de DoS, leitura arbitrária em dev server no Windows e problemas em dependências transitivas.
- **Solução recomendada:** Rodar `npm audit fix` em branch separada, revisar mudanças no lockfile e executar build/test antes de deploy.
- **Arquivos afetados:** `package-lock.json`, possivelmente `package.json`.
- **Status:** Aberto.

## 2026-07-31 - Testes Discord instáveis no pacote completo

- **Problema:** `npm test` falhou no pacote completo por timeout em testes do Discord, mas os testes isolados passaram.
- **Causa provável:** Contenção/tempo dos mocks de `discord.js` ou re-login desnecessário durante inicialização repetida.
- **Solução aplicada:** `DiscordAdapter.initialize()` agora retorna imediatamente quando o cliente já está pronto, usa imports estáticos do `discord.js` v14 e os mocks de teste disparam `clientReady` sem timer real.
- **Arquivos afetados:** `src/platforms/discord/DiscordAdapter.ts`, `tests/setup.ts`, `tests/unit/adapters.test.ts`, `tests/unit/discordAdapter.test.ts`.
- **Status:** Resolvido em 2026-07-31; `npm test` passou com 101 testes.

## 2026-07-31 - Build de serviços empacotava teste

- **Problema:** `npm run build` gerava `dist/services/autoModService.test.js`.
- **Causa:** Script `build:services` usava glob `src/services/*.ts`, incluindo arquivos `.test.ts`.
- **Solução aplicada:** Script alterado para listar explicitamente os serviços de produção.
- **Arquivos afetados:** `package.json`.
- **Status:** Resolvido em 2026-07-31; `npm run build` validado.
