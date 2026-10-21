#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════
# F1-REPAIR — INC-013 (rodar como ROOT):
#   sudo bash /tmp/f1-repair.sh
#
# Causa provável já mapeada no diagnóstico user-mode: DNS do container
# degradado desde o boot de 20/10 (getent vazio; dist-upgrade de 18/10
# OK, installs de 21/10 falham). NENHUM output é engolido aqui.
#
#   A. Diagnóstico completo (apt + DNS) — erro real visível
#   A2. Fix condicional de DNS (backup + re-teste)
#   B. apt-get update + install fail2ban/unattended-upgrades (visível)
#   C. jail.local fail2ban + enable + status sshd
#   D. unattended-upgrades security-only + confirmar
#   E. reset-failed (motd/cups) + snap remove cups (unit real de snap
#       não aceita mask — remove é o caminho)
#   F2. verificação final
# ══════════════════════════════════════════════════════════════════════
set -uo pipefail
[ "$(id -u)" = "0" ] || { echo "❌ Rode com sudo" >&2; exit 1; }

ok()   { echo "  ✓ $*"; }
skip() { echo "  ⚠ $*"; }
fail() { echo "  ✗ $*"; }

echo "═══ A. Diagnóstico (nada engolido) ═══"
echo "-- getent (exit code importa):"
getent hosts archive.ubuntu.com; echo "  getent exit=$?"
echo "-- resolv.conf:"; head -5 /etc/resolv.conf | sed 's/^/     /'
echo "-- resolvectl:"; resolvectl status 2>&1 | head -8 | sed 's/^/     /'
echo "-- rede bruta (IP direto, sem DNS):"
curl -m 8 -s -o /dev/null -w "  curl http://1.1.1.1 → %{http_code}\n" http://1.1.1.1 || fail "sem conectividade até por IP (rede, não DNS)"
echo "-- apt-get update (erro real, se houver):"
apt-get update 2>&1 | tail -8 | sed 's/^/     /'

echo "═══ A2. Fix de DNS (só se getent falhar) ═══"
if getent hosts archive.ubuntu.com >/dev/null 2>&1; then
  skip "DNS já resolvendo — nada a fazer"
else
  cp /etc/resolv.conf /etc/resolv.conf.bak-f1
  if printf 'nameserver 1.1.1.1\nnameserver 8.8.8.8\noptions edns0\n' > /etc/resolv.conf 2>/dev/null; then
    if getent hosts archive.ubuntu.com >/dev/null 2>&1; then
      ok "DNS restaurado (1.1.1.1/8.8.8.8; backup em resolv.conf.bak-f1)"
    else
      fail "resolv.conf reescrito mas getent ainda falha — problema mais fundo (rede do host?)"
    fi
  else
    fail "resolv.conf é read-only/bind-mount do host — ajuste no Proxmox (opcões DNS do container)"
  fi
fi

echo "═══ B. install fail2ban + unattended-upgrades (output visível) ═══"
export DEBIAN_FRONTEND=noninteractive
apt-get install -y fail2ban python3-systemd unattended-upgrades 2>&1 | tail -15 | sed 's/^/     /'
# Se ainda houver lock, mostrar quem segura:
if [ ! -x /usr/bin/fail2ban-client ]; then
  echo "-- fail2ban não apareceu; checando locks:"
  fuser -v /var/lib/dpkg/lock-frontend /var/lib/apt/lists/lock 2>&1 | sed 's/^/     /'
  dpkg --audit 2>&1 | head -6 | sed 's/^/     /'
  fail "install — veja o output acima"
else
  ok "fail2ban + python3-systemd + unattended-upgrades instalados"
fi

echo "═══ C. jail.local + fail2ban ativo ═══"
cat > /etc/fail2ban/jail.local <<'EOF'
[DEFAULT]
ignoreip = 127.0.0.1/8 ::1 100.64.0.0/10
bantime = 1h
maxretry = 5

[sshd]
enabled = true
backend = systemd
EOF
systemctl enable --now fail2ban >/dev/null 2>&1
sleep 3
if systemctl is-active --quiet fail2ban; then
  ok "fail2ban active"
  fail2ban-client status sshd 2>&1 | head -8 | sed 's/^/     /'
else
  fail "fail2ban não subiu: $(systemctl is-active fail2ban)"
fi

echo "═══ D. unattended-upgrades (security-only) ═══"
dpkg-reconfigure -f noninteractive unattended-upgrades >/dev/null 2>&1
cat /etc/apt/apt.conf.d/20auto-upgrades 2>/dev/null | sed 's/^/     /'
if systemctl is-active --quiet unattended-upgrades; then
  ok "unattended-upgrades active"
else
  # oneshot pode constar "inactive" entre execuções — o arquivo acima é a fonte da verdade
  skip "unit não está 'active' agora (oneshot) — 20auto-upgrades acima é o que vale"
fi

echo "═══ E. Estados failed + cups ═══"
systemctl reset-failed motd-news.service motd-news.timer snap.cups.cupsd.service 2>/dev/null
ok "reset-failed aplicado (motd-news/cups)"
if snap list 2>/dev/null | grep -q "^cups "; then
  echo "  -- snap remove cups (impressora em server headless; pode levar ~1min):"
  snap remove cups 2>&1 | tail -3 | sed 's/^/     /'
  [ -f /etc/systemd/system/snap.cups.cupsd.service ] && skip "unit snap.cups residual — inofensiva, some no reboot (ou: systemctl reset-failed)"
else
  skip "cups já não está nos snaps"
fi
systemctl reset-failed 2>/dev/null
echo "-- systemctl --failed (deve estar vazio):"
systemctl --failed --no-legend --no-pager | sed 's/^/     /'; echo "     (fim)"

echo "═══ F2 — Verificação final ═══"
echo "-- fail2ban jail sshd:"; fail2ban-client status sshd 2>/dev/null | head -8 | sed 's/^/     /'
echo "-- unattended-upgrades:"; systemctl is-active unattended-upgrades 2>/dev/null | sed 's/^/     /'
echo "-- services failed:"; systemctl --failed --no-legend --no-pager | sed 's/^/     /'; echo "     (fim)"
echo "-- upgradable:"; apt list --upgradable 2>/dev/null | tail -n +2 | head -5 | sed 's/^/     /'
echo "-- disco:"; df -h / | tail -1 | sed 's/^/     /'
echo "-- memória:"; free -h | grep -E "^Mem|^Swap" | sed 's/^/     /'
echo "-- journal:"; journalctl --disk-usage 2>/dev/null | sed 's/^/     /'
