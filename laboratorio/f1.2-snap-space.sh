#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════
# F1.2 — Onde foi o espaço dos snaps? (INC-013, rodar como ROOT):
#   sudo bash /tmp/f1.2-snap-space.sh
#
# F1.0-bis (read-only) já provou:
#   • du /var/lib/snapd = 46M (arquivos .sumiram), cache 4K, snapshots
#     vazio, snap changes todos Done → cenários A/C/D mortos.
#   • df parado em 53% (16G) → espaço seguro por processo root com
#     arquivos DELETADOS-ABERTOS (lsof +L1 como user não enxerga).
#
# Este script: captura a EVIDÊNCIA (lsof +L1 root + du vs df), e SÓ
# reinicia o snapd se o lsof apontar snapd segurando deletados.
# Não mata nem reinicia NADA do bot.
# ══════════════════════════════════════════════════════════════════════
set -uo pipefail
[ "$(id -u)" = "0" ] || { echo "❌ Rode com sudo" >&2; exit 1; }

echo "═══ A. EVIDÊNCIA: arquivos deleted-but-open (lsof +L1) ═══"
lsof +L1 2>/dev/null | awk 'NR==1 || $7 > 1048576 {print}' | head -25
echo
echo "-- soma de bytes deletados por processo:"
lsof +L1 2>/dev/null | awk 'NR>1 && $7 ~ /^[0-9]+$/ {s[$1]+=$7} END {for (p in s) printf "%10.1f MB  %s\n", s[p]/1048576, p}' | sort -rn | head -10
echo

echo "═══ B. du vs df (gap = deleted-open) ═══"
DF_USED=$(df / | awk 'NR==2{print $3}')
DF_PCT=$(df / | awk 'NR==2{print $5}')
echo "df usado: ${DF_USED} (${DF_PCT})"
echo "-- du real de / (leva ~40s)..."
DU_TOTAL=$(du -xs / 2>/dev/null | awk 'END{print $1}')
echo "du total: ${DU_TOTAL} KB"
echo "gap (df-du): $(( (DF_USED - DU_TOTAL) )) KB retido em arquivos deletados-abertos"

echo "═══ C. Fix condicional (só se snapd for o dono dos deletados) ═══"
SNAPD_RETIDO=$(lsof +L1 2>/dev/null | awk '$1=="snapd" && $7 ~ /^[0-9]+$/ {s+=$7} END {print s+0}')
if [ "$SNAPD_RETIDO" -gt 1048576 ]; then
  echo "  -- snapd segura $((SNAPD_RETIDO/1048576)) MB em arquivos deletados → restart snapd (não afeta o bot):"
  systemctl restart snapd
  sleep 6
  systemctl is-active snapd | sed 's/^/     snapd: /'
else
  echo "  -- snapd não segura arquivos deletados grandes; NÃO mexendo em nada."
  echo "  -- Se o gap do item B for grande e o dono for outro processo, PARE e"
  echo "     mostre o output (não matamos processos do bot por chute)."
fi

echo "═══ D. Pós-fix: df ═══"
df -h / | tail -1 | sed 's/^/     /'

echo "═══ E. Bot intacto? ═══"
sudo -u solanojr pm2 status bot-wpp 2>/dev/null | grep bot-wpp | sed 's/^/     /'
curl -s -o /dev/null -w "     metrics: HTTP %{http_code}\n" http://127.0.0.1:3001/metrics
