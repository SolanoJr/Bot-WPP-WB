#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════
# F1-SNAP-CLEANUP — INC-013 pendência D1+D2 (rodar como ROOT):
#   sudo bash /tmp/f1-snap-cleanup.sh
#
# F1.0 já auditado (read-only):
#   • baseline: disco 53% (15G livres), bot-wpp online (2h, 0 restarts),
#     /metrics 200, 7 revisões "disabled"
#   • chromium: zero dependência no código (F0 INC-013) e nenhum snap
#     o usa como base → removível
#
#   A. refresh.retain=2 (evita acúmulo futuro)
#   B. D1: remove revisões disabled (~1.3G)
#   C. D2: remove chromium + bases GUI gnome/mesa/gtk (~1.3G)
#   D. cores órfãos: só remove core22/24/26 se NENHUM app restante
#      depender deles (mantém bare + snapd)
#   E. reafirma retain=2
#   F2: disco liberado, services failed, bot online, metrics, snap list
# ══════════════════════════════════════════════════════════════════════
set -uo pipefail
[ "$(id -u)" = "0" ] || { echo "❌ Rode com sudo" >&2; exit 1; }

ok()   { echo "  ✓ $*"; }
skip() { echo "  ⚠ PULADO: $*"; }
fail() { echo "  ✗ FALHOU: $*"; }

BASE=$(df / | awk 'NR==2{print $5}' | tr -d '%')
echo "Baseline disco: ${BASE}%"

echo "═══ A. refresh.retain=2 ═══"
snap set system refresh.retain=2 && ok "retain=2 (só 2 revisões por snap daqui pra frente)"

echo "═══ B. D1 — revisões disabled ═══"
snap list --all | awk '/disabled/{print $1, $3}' | while read -r snapname revision; do
  [ -z "${snapname:-}" ] && continue
  echo "  -- snap remove ${snapname} rev ${revision}:"
  snap remove "$snapname" --revision="$revision" 2>&1 | tail -1 | sed 's/^/     /'
done
ok "revisões disabled removidas (se listadas acima)"

echo "═══ C. D2 — apps/bases GUI (apps antes das bases) ═══"
for s in chromium gnome-46-2404 mesa-2404 gtk-common-themes; do
  if snap list 2>/dev/null | grep -q "^${s} "; then
    snap remove "$s" 2>&1 | tail -1 | sed 's/^/     /'
  else
    skip "${s} já não está instalado"
  fi
done

echo "═══ D. Cores órfãos (mantém bare + snapd) ═══"
APPS_RESTANTES=$(snap list 2>/dev/null | tail -n +2 | grep -vE '^(bare|core[0-9]+|snapd)[[:space:]]' | grep -c . || true)
if [ "${APPS_RESTANTES}" -gt 0 ]; then
  skip "ainda há ${APPS_RESTANTES} snap(s) app(s) usando cores — cores mantidas"
else
  for c in core22 core24 core26; do
    if snap list 2>/dev/null | grep -q "^${c} "; then
      snap remove "$c" 2>&1 | tail -1 | sed 's/^/     /'
    else
      skip "${c} já removido"
    fi
  done
  ok "cores órfãs removidas (bare + snapd mantidos)"
fi

echo "═══ E. reafirma retain ═══"
snap set system refresh.retain=2 && ok "retain=2"

echo "═══ F2 — Verificação pós-limpeza ═══"
AFTER=$(df / | awk 'NR==2{print $5}' | tr -d '%')
echo "-- disco: ${BASE}% → ${AFTER}%"
df -h / | tail -1 | sed 's/^/     /'
echo "-- services failed:"; systemctl --failed --no-legend --no-pager | sed 's/^/     /'; echo "     (fim)"
echo "-- pm2 bot-wpp:"; sudo -u solanojr pm2 status bot-wpp 2>/dev/null | grep -E "bot-wpp" | sed 's/^/     /'
echo "-- metrics:"; curl -s -o /dev/null -w "     HTTP %{http_code}\n" http://127.0.0.1:3001/metrics
echo "-- snaps restantes:"; snap list 2>/dev/null | sed 's/^/     /'
