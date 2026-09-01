# 🚀 DEPLOY AGORA - Comandos Prontos para Executar

> ✅ **PUSH GITHUB CONCLUÍDO COM SUCESSO!**
> 
> Commit: `8ad85f1` - feat: implementação completa de otimizações (P0-P3)
> 
> Agora execute os comandos abaixo no servidor Linux via SSH.

---

## 📋 COMANDOS PARA EXECUTAR (Copie e Cole)

### 1️⃣ SSH no Servidor
```bash
ssh solanojr@45.79.100.161
```

### 2️⃣ Navegar para Diretório do Bot
```bash
cd /home/solanojr/bot-wpp
```

### 3️⃣ Backup do Banco (Segurança)
```bash
mkdir -p data/backups
sqlite3 data/bot_database.db ".backup 'data/backups/pre_deploy_$(date +%Y%m%d_%H%M%S).db'"
echo "✅ Backup criado!"
```

### 4️⃣ P0.3: FIX DNS PERMANENTE (CRÍTICO - Requer sudo)
```bash
# Tornar script executável
chmod +x scripts/fix-dns.sh

# Executar com sudo
sudo bash scripts/fix-dns.sh
```

**Verificações esperadas:**
```bash
# 1. Verificar DNS configurado
cat /etc/resolv.conf
# ✅ Esperado: deve ter nameserver 8.8.8.8 e 1.1.1.1

# 2. Verificar imutabilidade
lsattr /etc/resolv.conf
# ✅ Esperado: ----i------------ (flag 'i' presente)

# 3. Testar resolução
nslookup api.telegram.org 8.8.8.8
# ✅ Esperado: retorna IP válido (não erro)

nslookup discord.com 8.8.8.8
# ✅ Esperado: retorna IP válido
```

### 5️⃣ Deploy do Código
```bash
# Pull código atualizado
git pull origin main

# Instalar dependências (limpo)
npm ci

# Build
npm run build

# Verificar build gerado
ls -lh dist/core/multiPlatform.js
# ✅ Esperado: arquivo ~344K existe
```

### 6️⃣ P3.4: RELOAD PM2 (Graceful Shutdown)
```bash
# Reload com graceful shutdown
pm2 reload ecosystem.config.js

# Aguardar 10 segundos
sleep 10

# Verificar logs de shutdown/startup
pm2 logs bot-wpp --lines 50
```

**Logs esperados:**
```
🛑 [Shutdown] Recebido SIGTERM - iniciando encerramento gracioso...
[Shutdown] Parando monitoramento de memória...
[Shutdown] Desconectando plataformas...
[Shutdown] Parando servidor de métricas...
✅ [Shutdown] Encerramento gracioso concluído
🚀 Inicializando Bot-WPP Multi-Platform...
[MemoryMonitor] ✅ Iniciado (check a cada 60s)
[Cleanup] Limpeza periódica agendada (interval: 6h)
🎉 Todas as plataformas prontas!
```

---

## ✅ VALIDAÇÃO PÓS-DEPLOY (Aguardar 5 minutos)

### 1. Heap % (Deve estar < 50%)
```bash
curl -s http://localhost:3001/health | jq '.memory.heapPercent'
```
**✅ Esperado:** número < 50

### 2. DNS Errors (Deve ser vazio)
```bash
pm2 logs bot-wpp --lines 200 | grep -i "EAI_AGAIN\|ENOTFOUND"
```
**✅ Esperado:** saída vazia (sem erros)

### 3. Traces Baileys (Deve ser vazio)
```bash
pm2 logs bot-wpp --lines 200 | grep "loading from store\|updated cache"
```
**✅ Esperado:** saída vazia (traces silenciados)

### 4. Graceful Shutdown (Verificar logs)
```bash
pm2 logs bot-wpp --lines 30 | grep Shutdown
```
**✅ Esperado:** ver linha "✅ [Shutdown] Encerramento gracioso concluído"

### 5. Plataformas Conectadas
```bash
curl -s http://localhost:3001/health | jq '.platforms'
```
**✅ Esperado:**
```json
{
  "whatsapp": { "connected": true },
  "telegram": { "connected": true }
}
```

### 6. Testar Bot no WhatsApp
Enviar mensagem:
```
$menu
```
**✅ Esperado:** Bot responde com menu completo

---

## 📊 MÉTRICAS PROMETHEUS (Opcional)

```bash
# Verificar uso de memória
curl -s http://localhost:3001/metrics | grep memory_usage_bytes

# Verificar GC forçado (se heap subiu)
curl -s http://localhost:3001/metrics | grep gc_forced_total

# Verificar alertas de memória
curl -s http://localhost:3001/metrics | grep memory_alerts_total
```

---

## 🔧 CONFIGURAÇÃO OPCIONAL (Recomendado)

### Backup Automático (Cron - Diário às 3h)
```bash
# Editar crontab
crontab -e

# Adicionar linha (apertar 'i' para inserir, depois ESC + ':wq' para salvar):
0 3 * * * cd /home/solanojr/bot-wpp && bash scripts/backup-db.sh >> logs/backup.log 2>&1

# Verificar cron configurado
crontab -l
```

---

## 🐛 TROUBLESHOOTING

### Se Heap Continuar Alto (> 80%)
```bash
# 1. Verificar se GC está habilitado
pm2 show bot-wpp | grep node_args
# ✅ Esperado: ver --expose-gc, --max-old-space-size=512

# 2. Restart (não reload)
pm2 restart bot-wpp

# 3. Monitorar em tempo real
watch -n 5 'curl -s http://localhost:3001/health | jq .memory'
```

### Se DNS Continuar Falhando
```bash
# Re-aplicar fix
sudo bash scripts/fix-dns.sh

# Restart bot
pm2 restart bot-wpp

# Verificar logs
pm2 logs bot-wpp | grep -i "dns\|eai_again"
```

### Ver Logs Completos
```bash
# Tempo real
pm2 logs bot-wpp

# Últimas 200 linhas
pm2 logs bot-wpp --lines 200

# Apenas errors
pm2 logs bot-wpp --err --lines 100

# Status geral
pm2 status
pm2 show bot-wpp
```

---

## 🎯 RESULTADO ESPERADO

Após executar todos os passos:

- ✅ **Heap < 50%** (antes: 94%)
- ✅ **0 DNS failures** (antes: 15/dia)
- ✅ **Logs 100% limpos** (antes: 50% poluídos)
- ✅ **Graceful shutdown funciona**
- ✅ **Bot responde comandos**
- ✅ **Queries SQLite < 1ms** (antes: 50ms)

---

## 📚 DOCUMENTAÇÃO COMPLETA

- **DEPLOY.md** - Checklist completo + troubleshooting
- **docs/INFRASTRUCTURE.md** - Documentação técnica detalhada
- **RELEASE_NOTES.md** - Resumo executivo e métricas
- **IMPLEMENTACAO_COMPLETA.md** - O que foi feito

---

**🚀 Pronto! Execute os comandos acima e o bot estará otimizado em produção!**

Qualquer dúvida, consulte `DEPLOY.md` ou `docs/INFRASTRUCTURE.md`.
