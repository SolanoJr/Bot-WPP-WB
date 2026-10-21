#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════
# F1 — Manutenção do VPS (INC-013) — rodar como ROOT:
#   sudo bash /tmp/install-f1-manutencao.sh
#
# Premissas do F1.0 (já auditado, read-only):
#   • SEM IP público (eth0 192.168.30.x, rede privada do Proxmox)
#     → ufw DESPENSADO; porta 22 só acessível via LAN/tailnet.
#   • Load 2.5 = artefato do host Proxmox (CPU 87.5% idle aqui).
#   • Chromium SEM dependência no bot (só strings de UI) → snaps
#     NÃO são removidos por este script (listados no fim p/ aprovação).
#
# Seções (todas relatam ✓/✗ e continuam):
#   A. SSH: PermitRootLogin no (com backup + sshd -t + rollback)
#   B. fail2ban (jail sshd, ignoreip Tailscale 100.64.0.0/10)
#   C. journald cap 200M + mapa de /var/log (sem apagar nada)
#   D. pm2-logrotate (instalado como solanojr, não root!)
#   E. unattended-upgrades (security-only, sem auto-reboot)
#   F. Limpezas: lixo "'" + WAL checkpoint + mask dos 2 services failed
#   G. Manutenção mensal via systemd timer (root) + teste de restore
#   F2. Relatório de verificação pós-aplicação
# ══════════════════════════════════════════════════════════════════════
set -uo pipefail

if [ "$(id -u)" != "0" ]; then
  echo "❌ Rode com sudo: sudo bash $0" >&2
  exit 1
fi

ok()   { echo "  ✓ $*"; }
skip() { echo "  ⚠ PULADO: $*"; }
fail() { echo "  ✗ FALHOU: $* (continuando — verifique no fim)"; }

echo "═══ A. SSH hardening (PermitRootLogin no) ═══"
cp /etc/ssh/sshd_config /etc/ssh/sshd_config.bak-f1
if grep -qE '^PermitRootLogin' /etc/ssh/sshd_config; then
  sed -i 's/^PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
else
  echo 'PermitRootLogin no' >> /etc/ssh/sshd_config
fi
if sshd -t 2>/dev/null; then
  systemctl reload ssh && ok "PermitRootLogin no aplicado (reload não derruba sua sessão)"
else
  cp /etc/ssh/sshd_config.bak-f1 /etc/ssh/sshd_config
  fail "sshd -t reprovou a config — REVERTIDO do backup; sua sessão está intacta"
fi

echo "═══ B. fail2ban ═══"
export DEBIAN_FRONTEND=noninteractive
if apt-get install -y -qq fail2ban python3-systemd >/dev/null 2>&1; then
  ok "fail2ban + python3-systemd instalados"
else
  fail "apt-get install fail2ban"
fi
cat > /etc/fail2ban/jail.local <<'EOF'
[DEFAULT]
ignoreip = 127.0.0.1/8 ::1 100.64.0.0/10
bantime = 1h
maxretry = 5

[sshd]
enabled = true
backend = systemd
EOF
systemctl enable --now fail2ban >/dev/null 2>&1 && ok "fail2ban habilitado (ignoreip cobre toda a tailnet — você nunca se auto-bane)"

echo "═══ C. journald cap 200M ═══"
mkdir -p /etc/systemd/journald.conf.d
cat > /etc/systemd/journald.conf.d/99-size-cap.conf <<'EOF'
[Journal]
SystemMaxUse=200M
EOF
systemctl restart systemd-journald && ok "systemd-journald com SystemMaxUse=200M"
journalctl --vacuum-size=200M >/dev/null 2>&1 && ok "vacuum imediato aplicado"
echo "  -- Mapa de /var/log (nada apagado; decisão na próxima rodada):"
du -sh /var/log/* 2>/dev/null | sort -rh | head -12 | sed 's/^/     /'

echo "═══ D. pm2-logrotate (como solanojr) ═══"
if sudo -u solanojr bash -c 'pm2 install pm2-logrotate >/dev/null 2>&1 && pm2 set pm2-logrotate:max_size 50M >/dev/null && pm2 set pm2-logrotate:retain 7 >/dev/null && pm2 set pm2-logrotate:compress true >/dev/null && pm2 set "pm2-logrotate:rotateInterval" "0 3 * * *" >/dev/null'; then
  ok "pm2-logrotate: 50M, 7 cópias, comprimido, diário 03:00"
else
  fail "pm2 install pm2-logrotate (rode depois: pm2 install pm2-logrotate como solanojr)"
fi

echo "═══ E. unattended-upgrades (security-only) ═══"
if apt-get install -y -qq unattended-upgrades >/dev/null 2>&1; then
  dpkg-reconfigure -f noninteractive unattended-upgrades >/dev/null 2>&1
  ok "instalado + 20auto-upgrades criado (Allowed-Origins security = default do Ubuntu; Auto-Reboot fica off)"
else
  fail "apt-get install unattended-upgrades"
fi

echo "═══ F. Limpezas ═══"
# F.1 — arquivo lixo "'" (bug de quoting do F0, criado pelo agente)
if find /home/solanojr/bot-wpp -maxdepth 1 -name "'" -type f -print -quit | grep -q .; then
  find /home/solanojr/bot-wpp -maxdepth 1 -name "'" -type f -delete && ok "lixo \"'\" removido"
else
  ok "lixo \"'\" já não existe"
fi
# F.2 — WAL checkpoint
sudo -u solanojr bash -c 'cd ~/bot-wpp && python3 -c "import sqlite3
db = sqlite3.connect(\"data/bot_database.db\")
db.execute(\"PRAGMA wal_checkpoint(TRUNCATE)\")
print(\"  ✓ WAL checkpoint:\", db.execute(\"PRAGMA journal_mode\").fetchone()[0])"' || fail "WAL checkpoint"
# F.3 — mask dos services failed inócuos
systemctl mask motd-news.service motd-news.timer snap.cups.cupsd.service snap.cups.cupsd.socket >/dev/null 2>&1 && ok "motd-news + snap.cups masked (MOTD e impressora num server headless)"

echo "═══ G. Manutenção mensal (systemd timer root) ═══"
cat > /usr/local/bin/manutencao-mensal.sh <<'EOF'
#!/usr/bin/env bash
# INC-013 — manutenção mensal (roda como root via timer; itens do bot como solanojr)
set -u
echo "== $(date -Is) manutenção mensal =="
journalctl --vacuum-time=30d
apt-get autoremove -y >/dev/null 2>&1 && apt-get autoclean >/dev/null 2>&1 && echo "  ✓ apt autoremove/autoclean"
sudo -u solanojr bash -c 'cd ~/bot-wpp && python3 -c "import sqlite3
db = sqlite3.connect(\"data/bot_database.db\")
db.execute(\"PRAGMA wal_checkpoint(TRUNCATE)\")
print(\"  ✓ WAL checkpoint ok\")"'
LATEST=$(ls -t /home/solanojr/bot-wpp-backups/*.db 2>/dev/null | head -1)
[ -z "${LATEST:-}" ] && LATEST=$(ls -t /home/solanojr/bot-wpp/data/backups/auto_*.db 2>/dev/null | head -1)
if [ -n "${LATEST:-}" ]; then
  cp "$LATEST" /tmp/restore-test.db
  python3 -c "import sqlite3
db = sqlite3.connect('/tmp/restore-test.db')
print('  ✓ restore-test ('+'$LATEST'+'):', db.execute('PRAGMA integrity_check').fetchone()[0])"
  rm -f /tmp/restore-test.db
else
  echo "  ⚠ AVISO: nenhum .db de backup encontrado para testar"
fi
df -h / | tail -1
EOF
chmod 0755 /usr/local/bin/manutencao-mensal.sh
cat > /etc/systemd/system/manutencao-mensal.service <<'EOF'
[Unit]
Description=Manutencao mensal do VPS (INC-013)
[Service]
Type=oneshot
ExecStart=/usr/local/bin/manutencao-mensal.sh
EOF
cat > /etc/systemd/system/manutencao-mensal.timer <<'EOF'
[Unit]
Description=Manutencao mensal (dia 1, 04:00)
[Timer]
OnCalendar=*-*-01 04:00:00
Persistent=true
[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload
systemctl enable --now manutencao-mensal.timer >/dev/null 2>&1 && ok "timer mensal ativo (dia 1, 04:00, Persistent)"

echo
echo "═══ F2 — Verificação pós-aplicação ═══"
echo "-- fail2ban:"; systemctl is-active fail2ban 2>/dev/null | sed 's/^/     /'
fail2ban-client status sshd 2>/dev/null | head -8 | sed 's/^/     /' || echo "     (jail sshd sobe em ~30s; confira depois)"
echo "-- journald:"; journalctl --disk-usage 2>/dev/null | sed 's/^/     /'
echo "-- pm2 (solanojr):"; sudo -u solanojr pm2 ls 2>/dev/null | grep -E "bot-wpp|logrotate" | sed 's/^/     /'
echo "-- unattended-upgrades:"; systemctl is-active unattended-upgrades 2>/dev/null | sed 's/^/     /'
echo "-- services failed (deve estar vazio):"; systemctl --failed --no-legend --no-pager | sed 's/^/     /'; echo "     (fim)"
echo "-- disco:"; df -h / | tail -1 | sed 's/^/     /'
echo "-- memória:"; free -h | grep -E "Mem|Swap" | sed 's/^/     /'
echo
echo "-- Snaps instalados (tamanhos; remoção só com sua aprovação):"
du -sh /var/lib/snapd/snaps/*.snap 2>/dev/null | sort -rh | head -12 | sed 's/^/     /'
snap list 2>/dev/null | sed 's/^/     /' || true
echo
echo "═══ RESUMO ═══"
echo "A. SSH: PermitRootLogin no (backup em sshd_config.bak-f1)"
echo "B. fail2ban: jail sshd + ignoreip tailnet"
echo "C. journald: cap 200M (mapa de /var/log acima — limpeza profunda aguarda análise)"
echo "D. pm2-logrotate: 50M/7/compressed/diário"
echo "E. unattended-upgrades: security-only, sem auto-reboot"
echo "F. limpezas: lixo + WAL + mask motd/cups"
echo "G. manutenção mensal: timer dia 1 04:00 c/ teste de restore do backup"
