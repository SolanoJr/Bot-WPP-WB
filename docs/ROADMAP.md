# ROADMAP.md — Planejamento do Projeto

> Estado atual e próximos passos do desenvolvimento.

**Última atualização**: 2026-09-16 13:30 BRT
**Commit**: ee622b5

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
- [ ] Discord Desktop — validação pendente (SS-004, SS-005, SS-006, SS-007)

### Infraestrutura
- [x] DNS fix (systemd-resolved)
- [x] PM2 (bot-wpp + discord-screen)
- [x] Tailscale Funnel para Screen Share
- [x] Variáveis de ambiente documentadas

---

## 🔄 EM ANDAMENTO

### AutoMod Cassino
- [ ] Validar detecção de cassino em produção
- [ ] Testar falsos positivos/negativos
- [ ] Ajustar limiar de confiança se necessário

### Typecheck
- [ ] Adicionar `fromMe?: boolean` em AutoModContext para limpar 2 erros

---

## 📋 PRÓXIMO

### Testes Screen Share
- [ ] SS-004 Desktop viewer
- [ ] SS-005 Web → Desktop
- [ ] SS-006 Desktop → Web
- [ ] SS-007 Desktop → Desktop
- [ ] SS-008 2+ espectadores

### Documentação
- [ ] Consolidar documentação existente
- [ ] Remover arquivos duplicados

### Limpeza
- [ ] Remover endpoints temporários do testServer
- [ ] Arquivar scripts de laboratório antigos
- [ ] Remover dependências não utilizadas

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

**Última atualização**: 2026-09-16 13:30 BRT
**Commit**: ee622b5
