# ROADMAP.md — Planejamento do Projeto

> Estado atual e próximos passos do desenvolvimento.
> Documentação técnica central: [TECHNICAL.md](TECHNICAL.md).

**Última atualização**: 2026-10-02
**Commit**: ce97635

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
- [x] Testes: 509 (unit + integração) / 35 arquivos

### Plataformas
- [x] WhatsApp (Baileys v7 RC14)
- [x] Telegram (Telegraf)
- [x] Discord (discord.js)

### Configuração de automações por grupo (2026-10-02)
- [x] Configuração centralizada em `group_mod` (SQLite)
- [x] Grupo novo com TODAS as automações desligadas
- [x] Flags próprias para AntiBot e Casino
- [x] Comandos `$antibot`, `$casino`, `$auditonly`
- [x] `$automod status` mostrando moderação + serviços + modo
- [x] `$automod on/off` restrito à moderação (não mexe em welcome/apresentações)

### Welcome (2026-10-02)
- [x] Listener real de `group-participants.update`
- [x] `welcomeService` com placeholders (`{nome}`, `{numero}`, `{grupo}`)
- [x] `$setwelcome` persistido no SQLite (era Relay InMemory)
- [x] Padrão: `Bem-vindo @novato 👋`
- [x] Ban-on-rejoin preservado

### Apresentações (2026-10-02)
- [x] `presentationService` com sessões e consolidação
- [x] `presentationPublisher` com edição (não duplica)
- [x] `presentation_enabled` por grupo (default 0)
- [x] Identificação da Comunidade 085 via `linkedParent`
- [x] `message_thread_id` no Telegram
- [x] Espelho em Fortaleza 085 / tópico Apresentações (thread 2)
- [x] Retry quando o Telegram falha (não perde a apresentação)

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

### Correção de Bugs
Ver [KNOWN_ISSUES.md](KNOWN_ISSUES.md) para a lista canônica. Destaques:
- [x] Grupo novo herdava automações ligadas
- [x] `setGroupModField` ligava outras flags indiretamente
- [x] Casino/AntiBot sem flags próprias
- [x] `$automod` status quebrado
- [x] LID tratado como número estrangeiro
- [x] Double-count do AntiBot
- [x] Admin auth no kick/ban
- [x] `$setwelcome` persistindo no Relay InMemory
- [x] history sync não capturado
- [x] `isForeignNumber` falso positivo para JID de grupo
- [x] `quoted` no argumento errado do Baileys
- [x] `isSocketReady` incorreto no Baileys v7
- [x] Race condition em `handleClose`

### Documentação
- [x] TECHNICAL.md — **documentação técnica central**
- [x] AI_CONTEXT.md — Manual de entrada para LLMs/IDEs
- [x] KNOWN_ISSUES.md — Bugs conhecidos e resolvidos
- [x] DECISIONS.md — Decisões arquiteturais
- [x] CHANGELOG.md — Linha do tempo
- [x] ENDPOINTS.md — Endpoints HTTP
- [x] TELEMETRY.md — Métricas do Screen Share
- [x] PENDING_TESTS.md — Testes pendentes
- [x] SECURITY.md — Política de segurança
- [x] README.md — Estado atual

### Dependências e Segurança
- [x] npm audit: 0 vulnerabilidades

---

## 🔄 EM ANDAMENTO

### Validação em produção (aguardando autorização)
- [ ] Welcome real ao entrar em grupo
- [ ] `$setwelcome` com persistência após restart
- [ ] `$apresentar` e publicação no Telegram (thread 2)
- [ ] `$automod status` no grupo

### AutoMod Cassino
- [ ] Validar detecção de cassino em produção
- [ ] Testar falsos positivos/negativos
- [ ] Ajustar limiar de confiança se necessário

### Apresentações — pendências conhecidas
- [ ] Download de mídia do WhatsApp (`downloadMediaMessage`)
- [ ] Foto de perfil como fallback (`profilePictureUrl`)
- [ ] Aviso ao novato após publicação bem-sucedida

---

## 📋 PRÓXIMO

### Testes Screen Share
- [ ] SS-004 Desktop viewer
- [ ] SS-005 Web → Desktop
- [ ] SS-006 Desktop → Web
- [ ] SS-007 Desktop → Desktop
- [ ] SS-008 2+ espectadores

### Testes de Código
- [ ] testServer.test.ts — Testes dos endpoints HTTP
- [ ] Cobertura adicional para BaileysAdapter.ts
- [ ] `$kick`/`$ban` em Telegram/Discord (requer adapters com participants)

### Melhorias
- [ ] Rate limit por grupo (hoje em memória)
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

**Última atualização**: 2026-10-02
**Commit**: ce97635
