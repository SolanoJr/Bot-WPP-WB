# ROADMAP.md — Planejamento do Projeto

> Estado atual e próximos passos do desenvolvimento.

**Última atualização**: 2026-09-16 15:50 BRT
**Commit**: 805aaf7

---

## ✅ CONCLUÍDO

### Core
- [x] Arquitetura multi-plataforma (PlatformManager)
- [x] Baileys v7 como engine do WhatsApp
- [x] AutoMod com proteções de dono/bot/admin
- [x] Sistema de permissões (isProtectedTarget)
- [x] Logger estruturado (Winston)
- [x] MemoryMonitor com GC automático
- [x] Graceful shutdown
- [x] Testes unitários (176+ testes)

### Plataformas
- [x] WhatsApp (Baileys v7 RC14)
- [x] Telegram (Telegraf)
- [x] Discord (discord.js)

### Discord Screen Share
- [x] Arquitetura broadcaster → servidor → viewer
- [x] Codec avc1.64001f (H.264 High Profile)
- [x] WebCodecs VideoDecoder no player
- [x] Keyframe/config transmission
- [x] Tailscale Funnel para acesso externo
- [x] Telemetria: close codes, watch/unwatch, erros
- [x] Endpoint `/lab/screen-stats` para diagnóstico
- [ ] Discord Desktop — validação pendente (SS-004, SS-005, SS-006, SS-007)

### Infraestrutura
- [x] DNS fix (systemd-resolved)
- [x] PM2 (bot-wpp + discord-screen)
- [x] Tailscale Funnel para Screen Share
- [x] Variáveis de ambiente documentadas

### Correção de Bugs (Sessão 2026-09-16)
- [x] BUG-006: isForeignNumber falso positivo para JID de grupo
- [x] BUG-007: Typecheck — adicionado `fromMe?: boolean` em AutoModContext
- [x] BUG-008: 8 funções dead code removidas
- [x] BUG-009: Fallback hardcoded `WARRIOR_AUTH_KEY` removido

### Documentação
- [x] AI_CONTEXT.md — Manual de entrada para LLMs/IDEs
- [x] KNOWN_ISSUES.md — Bugs conhecidos e resolvidos
- [x] ROADMAP.md — Planejamento do projeto
- [x] CHANGELOG.md — Linha do tempo temporal
- [x] ENDPOINTS.md — Documentação dos endpoints HTTP
- [x] TELEMETRY.md — Métricas do Screen Share
- [x] PENDING_TESTS.md — Testes pendentes (Discord Web vs Desktop)
- [x] SECURITY.md — Política de segurança
- [x] README.md — Atualizado com estado atual
- [x] DIAGNOSIS_INCONSISTENCIAS.md — Auditoria de consistência

### Limpeza de Código
- [x] 8 funções dead code removidas (permissions, loggerService, index, format)
- [x] console.log residual substituído por loggerService (7 ocorrências)
- [x] 17 scripts de laboratório arquivados para `laboratorio/ARCHIVE/`
- [x] Documentação obsoleta arquivada para `docs/ARCHIVE/`
- [x] .gitignore atualizado (data/, logs/, laboratorio/*.json, nul)
- [x] .editorconfig criado

### Dependências e Segurança
- [x] axios 1.18.1 → 1.20.0
- [x] dotenv 16.4.5 → 16.6.1
- [x] tsx 4.22.4 → 4.23.13
- [x] ws 8.21.0 → 8.21.3
- [x] @types/node 25.9.4 → 25.9.7
- [x] esbuild 0.27.x → 0.28.1 (resolve GHSA-g7r4-m6w7-qqqr)
- [x] npm audit: 0 vulnerabilidades

### Sincronização
- [x] Windows ↔ GitHub ↔ Linux sincronizados (commit 805aaf7)

---

## 🔄 EM ANDAMENTO

### AutoMod Cassino
- [ ] Validar detecção de cassino em produção
- [ ] Testar falsos positivos/negativos
- [ ] Ajustar limiar de confiança se necessário

---

## 📋 PRÓXIMO

### Testes Screen Share
- [ ] SS-004 Desktop viewer
- [ ] SS-005 Web → Desktop
- [ ] SS-006 Desktop → Web
- [ ] SS-007 Desktop → Desktop
- [ ] SS-008 2+ espectadores

### Testes de Código
- [ ] testServer.test.ts — Testes dos endpoints HTTP (problemas de mock)
- [ ] Cobertura de testes para autoModEngine.ts
- [ ] Cobertura de testes para BaileysAdapter.ts

### Melhorias
- [ ] Substituir `X-Frame-Options: ALLOWALL` por configuração mais segura
- [ ] Adicionar rate limiting ao TestServer
- [ ] Adicionar testes de integração para Screen Share

---

## 🔮 FUTURO

### Melhorias
- [ ] Interface web para administração
- [ ] Dashboard de métricas (Prometheus/Grafana)
- [ ] Suporte a múltiplos bots WhatsApp
- [ ] Cache de mensagens para performance

### Plataformas
- [ ] Instagram (Threads)
- [ ] Signal
- [ ] iMessage

---

## 🚫 BLOQUEADO

- Discord Desktop: Aguardando testes (ver docs/PENDING_TESTS.md)
- Instagram: API limitada
- iMessage: Requer macOS

---

**Última atualização**: 2026-09-16 15:50 BRT
**Commit**: 805aaf7
