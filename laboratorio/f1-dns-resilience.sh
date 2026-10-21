#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════
# F1-REPAIR (fase final) — Teste de resiliência do DNS (INC-013)
# Rodar DETACHED (systemd-run) porque o restart do tailscaled derruba o
# túnel Tailscale — e o SSH da sessão morreria junto.
#
#   sudo systemd-run --unit=f1-dns-test bash /tmp/f1-dns-resilience.sh
#
# Depois de ~40s, leia o log:
#   cat /tmp/f1-dns-resilience.log
# ══════════════════════════════════════════════════════════════════════
exec > /tmp/f1-dns-resilience.log 2>&1
echo "== $(date -Is) restart tailscaled =="
systemctl restart tailscaled
sleep 15
echo "== resolv.conf pós-restart (NÃO pode ter 100.100.100.100) =="
cat /etc/resolv.conf
echo
echo "== getent =="
getent hosts archive.ubuntu.com | head -2
echo "getent exit=$?"
echo
echo "== apt update (erro real, se houver) =="
apt-get update 2>&1 | tail -4
echo
echo "== tailscale reconectado? =="
tailscale status 2>&1 | head -4
echo
echo "== preferência DNS persistida? =="
tailscale dns status 2>&1 | head -6
echo
echo "DONE $(date -Is)"
