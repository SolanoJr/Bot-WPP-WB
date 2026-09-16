# ROADMAP.md — Planejamento do Projeto

> Estado atual e próximos passos do desenvolvimento.

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

### Infraestrutura
- [x] DNS fix (systemd-resolved)
- [x] PM2 (bot-wpp + discord-screen)
- [x] Tailscale Funnel para Screen Share
- [x] Variáveis de ambiente documentadas

---

## 🔄 EM ANDAMENTO

### Discord Screen Share
- [ ] Investigar por que vídeo não aparece na Activity (BUG-006)
- [ ] Testar fluxo completo com múltiplos viewers
- [ ] Validar entrada de viewer após início da transmissão
- [ ] Testar reconexão de broadcaster/viewer

### AutoMod Cassino
- [ ] Validar detecção de cassino em produção
- [ ] Testar falsos positivos/negativos
- [ ] Ajustar limiar de confiança se necessário

---

## 📋 PRÓXIMO

### Testes
- [ ] Testes de regressão para DNS
- [ ] Testes de regressão para AutoMod
- [ ] Testes de integração para Screen Share
- [ ] Testes de carga para múltiplos viewers

### Documentação
- [ ] Consolidar documentação existente
- [ ] Remover arquivos duplicados
- [ ] Atualizar CHANGELOG

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

- Discord Screen Share: Aguardando investigação do BUG-006
- Instagram: API limitada
- iMessage: Requer macOS

---

**Última atualização**: 2026-09-16
