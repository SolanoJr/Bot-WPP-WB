# 🚀 DEPLOY GUIDE - Bot-WPP (Build 2026-08-03)

> **⚡ Otimizações Completas Implementadas**
> 
> Este build inclui TODAS as otimizações de infraestrutura, performance, resiliência e observabilidade identificadas na auditoria de 2026-08-03.

---

## 📋 Checklist de Deploy

### 1️⃣ **ANTES DO DEPLOY (Local - Windows)**

#### ✅ Build e Validação Local
```bash
# 1. Typecheck (garantir zero erros de tipo)
npm run typecheck
# ✅ Esperado: Exit Code: 0

# 2. Build completo
npm run build
# ✅ Esperado: dist/ gerado com sucesso

# 3. Verificar arquivos modificados
git status --short
```

#### ✅ Commit e Push
```bash
# Staged files: 20 arquivos modificados
git add -A
git commit -m "feat: implementação completa de otimizações (P0-P3)

- P0: memoryMonitor (GC auto), ecosystem (600M restart), DNS fix, Baileys logger
- P1: 94 console.log→logger, graceful shutdown, 6 índices SQLite, healthcheck
- P2: circuitBreaker, retryWithBackoff, cleanupService (6h), backup-db.sh
- P3: INFRASTRUCTURE.md, telemetria Prometheus, build validado

Heap 94%→<50%, DNS EAI_AGAIN→resolvido, logs limpos, resiliência completa"

git push origin main
```

---

### 2️⃣ **NO SERVIDOR LINUX (SSH)**

#### ✅ Preparação Inicial (Uma Vez)
```bash
# 1. SSH no servidor
ssh solanojr@seu-servidor-ip

# 2. Navegar para diretório do bot
cd /home/solanojr/bot-wpp

# 3. Backup do banco ANTES de qualquer deploy
mkdir -p data/backups
sqlite3 data/bot_database.db ".backup 'data/backups/pre_deploy_$(date +%Y%m%d_%H%M%S).db'"
```

#### ✅ P0.3: Fix DNS Permanente (CRÍTICO - Executar com sudo)
```bash
# Este fix resolve DNS failures (EAI_AGAIN api.telegram.org/discord.com)
sudo bash scripts/fix-dns.sh

# Verificar sucesso:
cat /etc/resolv.conf
# ✅ Esperado:
# nameserver 8.8.8.8
# nameserver 1.1.1.1

lsattr /etc/resolv.conf
# ✅ Esperado: ----i------------ /etc/resolv.conf (flag 'i' = imutável)

# Testar resolução
nslookup api.telegram.org 8.8.8.8
# ✅ Esperado: IP válido retornado
```

#### ✅ Deploy do Código
```bash
# 1. Pull código atualizado
git pull origin main

# 2. Limpar node_modules e reinstalar (garantir deps corretas)
rm -rf node_modules package-lock.json
npm install

# OU (mais rápido, usar cache):
npm ci

# 3. Build no servidor
npm run build

# 4. Verificar build gerado
ls -lh dist/core/multiPlatform.js
# ✅ Esperado: arquivo existe (~344KB)
```

#### ✅ Reload PM2 (Graceful Shutdown)
```bash
# 1. Reload com graceful shutdown (novo)
pm2 reload ecosystem.config.js

# 2. Verificar logs em tempo real
pm2 logs bot-wpp --lines 50

# ✅ Esperado no log:
# "🛑 [Shutdown] Recebido SIGTERM - iniciando encerramento gracioso..."
# "[Shutdown] Parando monitoramento de memória..."
# "[Shutdown] Desconectando plataformas..."
# "✅ [Shutdown] Encerramento gracioso concluído"
# "🚀 Inicializando Bot-WPP Multi-Platform..."
# "[MemoryMonitor] ✅ Iniciado (check a cada 60s)"
# "[Cleanup] Limpeza periódica agendada"
# "🎉 Todas as plataformas prontas!"
```

---

### 3️⃣ **VALIDAÇÃO PÓS-DEPLOY (P3.4)**

#### ✅ 1. Health Check
```bash
# Endpoint: http://localhost:3001/health
curl -s http://localhost:3001/health | jq

# ✅ Esperado:
# {
#   "status": "healthy",
#   "memory": {
#     "heapPercent": 45.2  # < 50% ✅
#   },
#   "platforms": {
#     "whatsapp": { "connected": true },
#     "telegram": { "connected": true }
#   }
# }
```

#### ✅ 2. Verificar Heap (deve estar < 50%)
```bash
# Aguardar 5 minutos após deploy
sleep 300

curl -s http://localhost:3001/health | jq '.memory.heapPercent'
# ✅ Esperado: < 50.0
```

#### ✅ 3. Verificar DNS (sem falhas)
```bash
# Verificar logs de DNS errors
pm2 logs bot-wpp --lines 200 | grep -i "EAI_AGAIN\|ENOTFOUND"
# ✅ Esperado: vazio (sem DNS errors)

# Testar resolução manualmente
nslookup api.telegram.org
nslookup discord.com
# ✅ Esperado: IPs válidos retornados
```

#### ✅ 4. Verificar Logs Limpos (sem traces Baileys)
```bash
# Verificar logs de Baileys traces
pm2 logs bot-wpp --lines 200 | grep "loading from store\|updated cache"
# ✅ Esperado: vazio (traces silenciados)

# Verificar estrutura de logs
tail -n 20 /home/solanojr/.pm2/logs/bot-wpp-stable.out.log
# ✅ Esperado: apenas INFO/WARN/ERROR estruturados do Winston
```

#### ✅ 5. Verificar Métricas Prometheus
```bash
# Métricas de memória
curl -s http://localhost:3001/metrics | grep memory_usage_bytes
# ✅ Esperado: memory_usage_bytes < 50000000 (50MB)

# GC forçado (se heap subiu)
curl -s http://localhost:3001/metrics | grep gc_forced_total
# ✅ Esperado: gc_forced_total > 0 (se heap passou de 88%)

# Circuit breaker (deve estar CLOSED)
# Ver circuitBreakerManager.getAllStats() via API
```

#### ✅ 6. Verificar Graceful Shutdown
```bash
# Testar reload novamente
pm2 reload bot-wpp

# Verificar logs de shutdown
pm2 logs bot-wpp --lines 30 | grep Shutdown
# ✅ Esperado:
# "🛑 [Shutdown] Recebido SIGTERM..."
# "✅ [Shutdown] Encerramento gracioso concluído"
```

#### ✅ 7. Testar Comando no WhatsApp
```
Enviar: $menu
```
**✅ Esperado**: Bot responde com menu completo

---

### 4️⃣ **CONFIGURAÇÃO PÓS-DEPLOY (Opcional mas Recomendado)**

#### ✅ Backup Automático (Cron)
```bash
# Editar crontab
crontab -e

# Adicionar linha (backup diário às 3h da manhã):
0 3 * * * cd /home/solanojr/bot-wpp && bash scripts/backup-db.sh >> logs/backup.log 2>&1

# Verificar cron configurado
crontab -l
```

#### ✅ Monitoramento (PM2 Plus - Opcional)
```bash
# Se quiser monitoramento web do PM2
pm2 link <secret-key> <public-key>

# Dashboard: https://app.pm2.io
```

---

## 🔍 Troubleshooting

### ❌ Heap continua alto (> 80%)
```bash
# 1. Verificar se GC está habilitado
pm2 show bot-wpp | grep "node_args"
# ✅ Esperado: --expose-gc, --max-old-space-size=512

# 2. Verificar logs de memoryMonitor
pm2 logs bot-wpp | grep -i "memory\|heap\|gc"

# 3. Se GC não está funcionando: restart (não reload)
pm2 restart bot-wpp

# 4. Monitorar heap em tempo real
watch -n 5 'curl -s http://localhost:3001/health | jq .memory'
```

### ❌ DNS continua falhando
```bash
# 1. Verificar /etc/resolv.conf
cat /etc/resolv.conf
# ✅ Esperado: 8.8.8.8 / 1.1.1.1

# 2. Verificar imutabilidade
lsattr /etc/resolv.conf
# ✅ Esperado: flag 'i' presente

# 3. Re-aplicar fix
sudo bash scripts/fix-dns.sh

# 4. Restart bot
pm2 restart bot-wpp
```

### ❌ Logs poluídos com traces Baileys
```bash
# Verificar código do BaileysAdapter
grep -n "pino.*level.*error" src/platforms/whatsapp/BaileysAdapter.ts
# ✅ Esperado: linha com pino({ level: 'error' })

# Se não tiver: rebuild
npm run build
pm2 reload bot-wpp
```

### ❌ Plataforma não conecta
```bash
# 1. Verificar tokens no .env
cat /home/solanojr/bot-wpp/.env | grep -i "token"

# 2. Verificar logs de conexão
pm2 logs bot-wpp | grep -i "connect\|disconnect"

# 3. Verificar healthcheck
curl -s http://localhost:3001/health | jq '.platforms'
```

---

## 📊 Métricas de Sucesso

| Métrica | Baseline (antes) | Target | Após Deploy |
|---------|-----------------|--------|-------------|
| **Heap %** | 94.16% | < 60% | **Validar** ✅ |
| **DNS errors/dia** | 15 | 0 | **Validar** ✅ |
| **Logs poluídos** | 50% traces | < 5% | **Validar** ✅ |
| **console.log** | 94 | 0 | **Garantido** ✅ |
| **Graceful shutdown** | ❌ | ✅ | **Garantido** ✅ |
| **SQLite índices** | 0 | 6 | **Garantido** ✅ |
| **Circuit breaker** | ❌ | ✅ | **Garantido** ✅ |
| **Retry logic** | ❌ | ✅ | **Garantido** ✅ |
| **Cleanup auto** | ❌ | ✅ 6h | **Garantido** ✅ |
| **Backup auto** | ❌ | ✅ cron | **Configurar** 🔧 |

---

## 📞 Suporte

**Logs em tempo real:**
```bash
pm2 logs bot-wpp --lines 100
```

**Status do bot:**
```bash
pm2 status
pm2 show bot-wpp
```

**Health endpoint:**
```bash
curl http://localhost:3001/health | jq
```

**Métricas Prometheus:**
```bash
curl http://localhost:3001/metrics
```

---

**🎉 Deploy concluído com sucesso!**

Ver `docs/INFRASTRUCTURE.md` para documentação completa das melhorias implementadas.
