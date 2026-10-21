#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════
# INC-012 — Watchdog do tailscaled (mitigação da queda de 20/10)
#
# INSTALAÇÃO (no VPS, com root):
#   sudo bash /tmp/install-tailscale-watchdog.sh
#
# O que faz:
#   1. /usr/local/bin/check-tailscaled.sh — checa `tailscale status --json`:
#      reinicia o tailscaled se BackendState != "Running" OU Self.Online
#      != true. Cobre os dois modos de falha: daemon morto (status falha)
#      E o caso real de 20/10 — processo "active (running)" mas nó caído
#      da tailnet ("last seen 3h ago").
#   2. check-tailscaled.service (oneshot) + check-tailscaled.timer
#      (OnBootSec=2min, OnUnitActiveSec=5min → roda a cada 5min).
#   3. daemon-reload + enable --now + mostra o timer.
# ══════════════════════════════════════════════════════════════════════
set -euo pipefail

if [ "$(id -u)" != "0" ]; then
  echo "❌ Rode com sudo: sudo bash $0" >&2
  exit 1
fi

echo "── 1/3 Script de checagem..."
cat > /usr/local/bin/check-tailscaled.sh <<'EOF'
#!/usr/bin/env bash
# INC-012: reinicia o tailscaled se o backend não estiver Running+Online.
set -u
STATE="$(/usr/bin/tailscale status --json 2>/dev/null \
  | /usr/bin/python3 -c 'import json,sys
try:
    d = json.load(sys.stdin)
    print(d.get("BackendState", ""), d.get("Self", {}).get("Online", False))
except Exception:
    print("ERRO", False)' 2>/dev/null || true)"
if [ "$STATE" != "Running True" ]; then
  /usr/bin/logger -t check-tailscaled "anormal: 'STATE=${STATE:-vazio}' — restart tailscaled"
  systemctl restart tailscaled
fi
EOF
chmod 0755 /usr/local/bin/check-tailscaled.sh

echo "── 2/3 Service + Timer..."
cat > /etc/systemd/system/check-tailscaled.service <<'EOF'
[Unit]
Description=Watchdog do tailscaled (INC-012)
After=network-online.target tailscaled.service

[Service]
Type=oneshot
ExecStart=/usr/local/bin/check-tailscaled.sh
EOF

cat > /etc/systemd/system/check-tailscaled.timer <<'EOF'
[Unit]
Description=Watchdog do tailscaled a cada 5min (INC-012)

[Timer]
OnBootSec=2min
OnUnitActiveSec=5min

[Install]
WantedBy=timers.target
EOF

echo "── 3/3 Habilitando timer..."
systemctl daemon-reload
systemctl enable --now check-tailscaled.timer

echo "── Estado final:"
systemctl list-timers check-tailscaled.timer --no-pager | head -3
echo "── Teste manual (service):"
systemctl start check-tailscaled.service && echo "✅ Watchdog instalado e operando."
