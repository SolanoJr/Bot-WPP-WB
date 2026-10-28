#!/usr/bin/env bash
# WPP-HEALTH — smoke test FUNCIONAL do bot (INC-026)
# Diferente do wpp-monitor (infra: disco/mem), este verifica se o bot está
# FUNCIONANDO: worker de feedback, scheduler de notícias, pm2, DB e
# conectividade do WhatsApp (heartbeat de credenciais ~10min).
# Alertas → Telegram privado do dono (TELEGRAM_ALERT_CHAT_ID).
# Cooldown 1h por check (state em ~/var/wpp-health/); ✅ na recuperação.
set -u
ENV_FILE="/home/solanojr/bot-wpp/.env"
STATE_DIR="$HOME/var/wpp-health"
LOG="$HOME/var/log/wpp-health.log"
DB="/home/solanojr/bot-wpp/data/bot_database.db"
OUTLOG="/home/solanojr/.pm2/logs/bot-wpp-out.log"
COOLDOWN=3600
mkdir -p "$STATE_DIR" "$(dirname "$LOG")"

# auto-limite do log (mantém últimas 20k linhas se passar de 5MB)
if [ -f "$LOG" ] && [ "$(stat -c%s "$LOG" 2>/dev/null || echo 0)" -gt 5000000 ]; then
  tail -n 20000 "$LOG" > "${LOG}.tmp" 2>/dev/null && mv "${LOG}.tmp" "$LOG"
fi

TOKEN=$(grep -E '^TELEGRAM_BOT_TOKEN=' "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
CHAT=$(grep -E '^TELEGRAM_ALERT_CHAT_ID=' "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
[ -z "$CHAT" ] && CHAT=$(grep -E '^TELEGRAM_CHAT_ID=' "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
if [ -z "$TOKEN" ] || [ -z "$CHAT" ]; then
  echo "$(date -Is) ERRO: credenciais Telegram ausentes no .env" >> "$LOG"
  exit 1
fi
HOSTN=$(hostname)

send() {
  if curl -sm 15 -X POST "https://api.telegram.org/bot${TOKEN}/sendMessage" \
       --data-urlencode "chat_id=${CHAT}" --data-urlencode "text=$1" >/dev/null 2>&1; then
    echo "$(date -Is) ENVIO: $1" >> "$LOG"
  else
    echo "$(date -Is) FALHA ENVIO: $1" >> "$LOG"
  fi
}

check() { # $1=nome $2=valor $3=breach(0/1) $4=detalhe
  local name="$1" val="$2" breach="$3" detail="$4"
  local sf="$STATE_DIR/${name}.state" lf="$STATE_DIR/${name}.last"
  local state now last
  state=$(cat "$sf" 2>/dev/null || echo "ok")
  now=$(date +%s)
  if [ "$breach" = "1" ]; then
    last=$(cat "$lf" 2>/dev/null || echo 0)
    if [ "$state" != "alerting" ] || [ $((now - last)) -ge "$COOLDOWN" ]; then
      send "🔴 WPP-HEALTH: ${name} ${val} ${detail} em ${HOSTN}."
      echo "alerting" > "$sf"; echo "$now" > "$lf"
      echo "$(date -Is) ALERTA ${name} ${val} ${detail}" >> "$LOG"
    else
      echo "$(date -Is) SILENCIO ${name} ${val} (cooldown)" >> "$LOG"
    fi
  else
    if [ "$state" = "alerting" ]; then
      send "✅ WPP-HEALTH: ${name} recuperado (${val}) em ${HOSTN}."
      echo "$(date -Is) RECUPERADO ${name} ${val}" >> "$LOG"
    fi
    echo "ok" > "$sf"; rm -f "$lf"
  fi
}

# ─── 1. Worker de feedback: eventos 'pending' presos há mais de 8h ────────
# (worker roda a cada 6h + janela de agrupamento 10min; pending >8h = travado)
STUCK_LIMIT=$(( $(date +%s%3N) - 8*3600*1000 ))
stuck=$(timeout 3 python3 -c "
import sqlite3
c = sqlite3.connect('${DB}')
cur = c.execute(\"SELECT COUNT(*) FROM feedback_events WHERE status='pending' AND left_at < ${STUCK_LIMIT}\")
print(cur.fetchone()[0])" 2>/dev/null || echo ERR)
if [ "$stuck" = "ERR" ]; then
  check feedback-worker "DB" 1 "inacessível na query de stuck"
elif [ "$stuck" -gt 0 ] 2>/dev/null; then
  check feedback-worker "${stuck} evento(s)" 1 "pending >8h — worker de feedback não está processando"
else
  check feedback-worker "ok" 0 ""
fi

# ─── 2. News scheduler: nenhuma notícia enviada nas últimas 25h ────────────
news=$(timeout 3 python3 -c "
import sqlite3
c = sqlite3.connect('${DB}')
cur = c.execute(\"SELECT COUNT(*) FROM news_history WHERE sent_at > datetime('now','-25 hours')\")
print(cur.fetchone()[0])" 2>/dev/null || echo ERR)
if [ "$news" = "ERR" ]; then
  check news-scheduler "DB" 1 "inacessível na query de news"
elif [ "${news:-0}" -eq 0 ] 2>/dev/null; then
  check news-scheduler "0" 1 "notícia enviada nas últimas 25h (scheduler morto?)"
else
  check news-scheduler "${news}" 0 ""
fi

# ─── 3. pm2: processo bot-wpp online ──────────────────────────────────────
status=$(pm2 jlist 2>/dev/null | jq -r '.[] | select(.name=="bot-wpp") | .pm2_env.status' 2>/dev/null | head -1)
if [ "$status" != "online" ]; then
  check pm2 "status=${status:-VAZIO}" 1 "processo bot-wpp fora do ar"
else
  check pm2 "online" 0 ""
fi

# ─── 4. DB responde (SELECT 1 com timeout de 3s) ──────────────────────────
if timeout 3 python3 -c "
import sqlite3
sqlite3.connect('${DB}').execute('SELECT 1').fetchone()" >/dev/null 2>&1; then
  check db "ok" 0 ""
else
  check db "timeout/erro" 1 "SELECT 1 não respondeu em 3s"
fi

# ─── 5. WhatsApp vivo: heartbeat de credenciais (tick ~10min do Baileys) ──
# Enquanto conectado, o Baileys salva credenciais a cada ~10min. Sem tick
# há mais de 30min = desconexão/travamento silencioso do WhatsApp.
hb_age_min() {
  local ts line
  line=$(grep -a 'Credenciais atualizadas' "$OUTLOG" 2>/dev/null | tail -1 | cut -d' ' -f1 | sed 's/:$//')
  [ -z "$line" ] && { echo 9999; return; }
  ts=$(date -d "${line}" +%s 2>/dev/null || echo 0)
  [ "$ts" = "0" ] && { echo 9999; return; }
  echo $(( ( $(date +%s) - ts ) / 60 ))
}
hb=$(hb_age_min)
if [ "$hb" -gt 30 ] 2>/dev/null; then
  check whatsapp "heartbeat há ${hb}min" 1 "sem tick de credenciais em 30min (desconectado/travado?)"
else
  check whatsapp "heartbeat ${hb}min" 0 ""
fi

# ─── 6. Comandos críticos: [ERROR] em handlers nas últimas 1h ──────────────
# Detecta handler quebrado silenciosamente (ex.: INC-027 antes do fix: o
# ban/kick respondia "tente novamente" sem que ninguém soubesse que era
# crônico). AUTH-FAIL NÃO conta (comportamento esperado); só [ERROR].
# Formato real no out.log: "[ERROR]: ❌ [context] mensagem" (logError) e
# "[ERROR]: ❌ [kick] Erro: ..." — o texto inclui as keywords do grep.
crit_errors=$(grep -aE "\[ERROR\].*(ban|kick|noticias|presentation|feedback|welcome)" "$OUTLOG" 2>/dev/null | awk -v cutoff="$(date -d '1 hour ago' '+%Y-%m-%dT%H:%M:%S')" '
  match($0, /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}/) {
    ts = substr($0, 1, 19);
    # mawk (awk do Ubuntu) não tem mktime — comparar ISO como string
    # funciona: mesmo formato, zeros à esquerda, ordem lexicográfica.
    if (ts >= cutoff) count++
  }
  END { print count+0 }
')
if [ "${crit_errors:-0}" -gt 0 ] 2>/dev/null; then
  check critical-commands "${crit_errors} erro(s)/1h" 1 "handlers (ban/kick/noticias/presentation/feedback/welcome) com [ERROR] — investigar /home/solanojr/.pm2/logs/bot-wpp-out.log"
else
  check critical-commands "ok" 0 ""
fi

# ─── 7. Resumo diário (1x por dia, entre 8h e 9h) ─────────────────────────
hour=$(date +%H)
daily_file="$STATE_DIR/daily-summary.last"
today=$(date +%Y-%m-%d)
last_daily=$(cat "$daily_file" 2>/dev/null || echo "")
if [ "$hour" = "08" ] && [ "$last_daily" != "$today" ]; then
  bot_pid=$(pgrep -f "dist/core/multiPlatform.js" | head -1)
  uptime_h=$(ps -o etime= -p "${bot_pid:-0}" 2>/dev/null | tr -d ' ' || echo "?")
  news_24h=$(timeout 3 python3 -c "
import sqlite3
c = sqlite3.connect('${DB}')
cur = c.execute(\"SELECT COUNT(*) FROM news_history WHERE sent_at > datetime('now','-24 hours')\")
print(cur.fetchone()[0])" 2>/dev/null || echo "?")
  feedback_24h=$(timeout 3 python3 -c "
import sqlite3
c = sqlite3.connect('${DB}')
cur = c.execute(\"SELECT COUNT(*) FROM feedback_events WHERE created_at > (strftime('%s','now')*1000 - 86400000)\")
print(cur.fetchone()[0])" 2>/dev/null || echo "?")
  send "📊 WPP-HEALTH resumo diário em ${HOSTN}
🟢 Bot: online há ${uptime_h:-?}
📰 Notícias (24h): ${news_24h:-?}
💬 Feedbacks (24h): ${feedback_24h:-?}
📱 Plataformas: WhatsApp + Telegram + Discord
⚠️ Erros comandos (1h): ${crit_errors:-0}"
  echo "$today" > "$daily_file"
  echo "$(date -Is) RESUMO DIÁRIO enviado" >> "$LOG"
fi

bot_pid=$(pgrep -f "dist/core/multiPlatform.js" | head -1)
uptime_h=$(ps -o etime= -p "${bot_pid:-0}" 2>/dev/null | tr -d ' ' || echo "?")
echo "$(date -Is) CICLO COMPLETO (feedback=${stuck:-0} news=${news:-0} pm2=${status} hb=${hb}min crit=${crit_errors:-0} uptime=${uptime_h:-?})" >> "$LOG"
exit 0
