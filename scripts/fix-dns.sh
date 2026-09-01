#!/bin/bash
# 🌐 Fix DNS Permanente
# Resolve EAI_AGAIN api.telegram.org / discord.com
# BUG: DNS do Tailscale (100.100.100.100) falha intermitentemente

set -e

echo "🌐 [DNS] Configurando DNS permanente..."

# Backup do resolv.conf original
if [ -f /etc/resolv.conf ] && [ ! -f /etc/resolv.conf.backup ]; then
  sudo cp /etc/resolv.conf /etc/resolv.conf.backup
  echo "✅ [DNS] Backup criado: /etc/resolv.conf.backup"
fi

# Remover imutabilidade se existir
sudo chattr -i /etc/resolv.conf 2>/dev/null || true

# Escrever DNS confiáveis
sudo bash -c 'cat > /etc/resolv.conf << EOF
# Bot-WPP: DNS fix permanente (2026-09-01)
# Previne EAI_AGAIN com DNS do Tailscale/PVE
nameserver 8.8.8.8
nameserver 1.1.1.1
nameserver 8.8.4.4
options timeout:2 attempts:3
EOF'

# Tornar imutável (previne sobrescrita)
sudo chattr +i /etc/resolv.conf

echo "✅ [DNS] Configurado:"
cat /etc/resolv.conf

echo ""
echo "🧪 [DNS] Testando resolução..."
if nslookup api.telegram.org 8.8.8.8 > /dev/null 2>&1; then
  echo "✅ api.telegram.org: OK"
else
  echo "❌ api.telegram.org: FALHOU"
fi

if nslookup discord.com 8.8.8.8 > /dev/null 2>&1; then
  echo "✅ discord.com: OK"
else
  echo "❌ discord.com: FALHOU"
fi

echo ""
echo "✅ [DNS] Fix aplicado com sucesso!"
echo "💡 Para reverter: sudo chattr -i /etc/resolv.conf && sudo cp /etc/resolv.conf.backup /etc/resolv.conf"
