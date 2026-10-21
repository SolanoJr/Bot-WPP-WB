#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════
# INSTALL-WPP-MONITOR — INC-013 nível 3 (rodar como ROOT):
#   sudo bash /tmp/install-wpp-monitor.sh
#
# F2.0 auditado: TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID existem no .env
# do bot (nomes apenas; valores nunca impressos). jq presente.
#
# Instala /usr/local/bin/wpp-monitor.sh (4 checks + cooldown 1h +
# alerta/recuperação via Telegram), service+timer (5min), e roda o
# teste embutido: 2x silêncio + 🔴 alerta forçado (DISK_THRESHOLD=1) +
# ✅ recuperação na rodada normal seguinte.
# ══════════════════════════════════════════════════════════════════════
set -uo pipefail
[ "$(id -u)" = "0" ] || { echo "❌ Rode com sudo" >&2; exit 1; }

ok()   { echo "  ✓ $*"; }
skip() { echo "  ⚠ $*"; }
fail() { echo "  ✗ FALHOU: $*"; }

echo "═══ A. /usr/local/bin/wpp-monitor.sh ═══"
cat > /usr/local/bin/wpp-monitor.sh <<'MONITOR'
#!/usr/bin/env bash
# WPP-MONITOR — disco/memória/tailscale/pm2 + alerta Telegram (cooldown 1h)
set -u
ENV_FILE="/home/solanojr/bot-wpp/.env"
STATE_DIR="/var/lib/wpp-monitor"
LOG="/var/log/wpp-monitor.log"
DISK_THRESHOLD="${DISK_THRESHOLD:-85}"
MEM_THRESHOLD="${MEM_THRESHOLD:-90}"
COOLDOWN=3600
mkdir -p "$STATE_DIR"

# auto-limite do log (mantém últimas 20k linhas se passar de 5MB)
if [ -f "$LOG" ] && [ "$(stat -c%s "$LOG" 2>/dev/null || echo 0)" -gt 5000000 ]; then
  tail -n 20000 "$LOG" > "${LOG}.tmp" 2>/dev/null && mv "${LOG}.tmp" "$LOG"
fi

TOKEN=$(grep -E '^TELEGRAM_BOT_TOKEN=' "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
CHAT=$(grep -E '^TELEGRAM_ALERT_CHAT_ID=' "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
[ -z "$CHAT" ] && CHAT=$(grep -E '^TELEGRAM_CHAT_ID='  "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
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
      send "🔴 WPP-MONITOR: ${name} ${val} ${detail} em ${HOSTN}."
      echo "alerting" > "$sf"; echo "$now" > "$lf"
    else
      echo "$(date -Is) SILENCIO ${name} ${val} (cooldown)" >> "$LOG"
    fi
  else
    if [ "$state" = "alerting" ]; then
      send "✅ WPP-MONITOR: ${name} recuperado ${val} em ${HOSTN}."
      echo "ok" > "$sf"
    else
      echo "$(date -Is) OK: ${name} ${val}" >> "$LOG"
    fi
  fi
}

# 1. disco
DISK=$(df / | awk 'NR==2{print $5}' | tr -d '%')
if [ "$DISK" -gt "$DISK_THRESHOLD" ]; then D=1; else D=0; fi
check DISCO "${DISK}%" "$D" "(limite ${DISK_THRESHOLD}%)"

# 2. memória
MEM=$(free | awk '/Mem:/ {printf "%.0f", $3/$2*100}')
if [ "$MEM" -gt "$MEM_THRESHOLD" ]; then M=1; else M=0; fi
check MEMORIA "${MEM}%" "$M" "(limite ${MEM_THRESHOLD}%)"

# 3. tailscale (não reinicia — o watchdog tailscaled cuida disso)
TS_JSON=$(tailscale status --json 2>/dev/null || echo '{}')
TS=$(echo "$TS_JSON" | jq -r '.BackendState // "unknown"')
TS_ON=$(echo "$TS_JSON" | jq -r '.Self.Online // false')
if [ "$TS" != "Running" ] || [ "$TS_ON" != "true" ]; then
  T=1; TVAL="BackendState=${TS} Online=${TS_ON}"
else
  T=0; TVAL="running"
fi
check TAILSCALE "$TVAL" "$T" ""

# 4. pm2 bot-wpp (PM2 do usuário — não o do root)
PM=$(sudo -u solanojr pm2 jlist 2>/dev/null | jq -r '.[] | select(.name=="bot-wpp") | .pm2_env.status' 2>/dev/null | head -1)
[ -z "${PM:-}" ] && PM="ausente"
if [ "$PM" != "online" ]; then P=1; else P=0; fi
check PM2 "status=${PM}" "$P" ""
MONITOR
chmod 0755 /usr/local/bin/wpp-monitor.sh
ok "wpp-monitor.sh instalado (4 checks, cooldown 1h, log self-limitado)"

echo "═══ B. service + timer ═══"
cat > /etc/systemd/system/wpp-monitor.service <<'EOF'
[Unit]
Description=WPP Monitor — disco/mem/tailscale/pm2 + alerta Telegram (INC-013)
After=network-online.target
[Service]
Type=oneshot
ExecStart=/usr/local/bin/wpp-monitor.sh
TimeoutStartSec=120
EOF
cat > /etc/systemd/system/wpp-monitor.timer <<'EOF'
[Unit]
Description=WPP Monitor a cada 5min
[Timer]
OnBootSec=3min
OnUnitActiveSec=5min
[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload
systemctl enable --now wpp-monitor.timer >/dev/null 2>&1 && ok "wpp-monitor.timer habilitado (boot+3min, depois 5/5min)"

echo "═══ D. Teste embutido ═══"
echo "-- rodada 1 (tudo ok = silêncio):"
/usr/local/bin/wpp-monitor.sh && echo "  ✓ rodada 1 ok"
echo "-- rodada 2 (idempotência = silêncio):"
/usr/local/bin/wpp-monitor.sh && echo "  ✓ rodada 2 ok"
echo "-- forçando alerta (DISK_THRESHOLD=1 → deve mandar 🔴 no seu Telegram):"
DISK_THRESHOLD=1 /usr/local/bin/wpp-monitor.sh && echo "  ✓ alerta forçado disparado"
echo "-- rodada normal (deve mandar ✅ recuperação):"
/usr/local/bin/wpp-monitor.sh && echo "  ✓ recuperação processada"

echo "═══ E. Evidências ═══"
echo "-- timers:"; systemctl list-timers wpp-monitor.timer --no-pager | head -4 | sed 's/^/     /'
echo "-- log (tail -20):"; tail -20 /var/log/wpp-monitor.log 2>/dev/null | sed 's/^/     /'
echo "-- state dir:"; ls -la /var/lib/wpp-monitor/ | sed 's/^/     /'
echo
echo "CONFIRA NO SEU TELEGRAM: 1 mensagem 🔴 (disco forçado) + 1 mensagem ✅ (recuperação)."
