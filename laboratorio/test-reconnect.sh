#!/bin/bash
# Teste controlado de reconnect do socket Baileys
# NÃO apaga sessão, NÃO desloga, NÃO gera QR/pairing

LOG="/home/solanojr/bot-wpp/logs/combined.log"
TESTLOG="/home/solanojr/bot-wpp/logs/test-reconnect.log"
PORT=3004

echo "=== TESTE CONTROLADO DE RECONNECT ===" | tee "$TESTLOG"
echo "Timestamp: $(date)" | tee -a "$TESTLOG"
echo "" | tee -a "$TESTLOG"

# 1. Estado inicial do socket
echo "--- 1. ESTADO INICIAL DO SOCKET ---" | tee -a "$TESTLOG"
curl -s "http://127.0.0.1:$PORT/lab/adapter?platform=whatsapp" 2>/dev/null | tee -a "$TESTLOG"
echo "" | tee -a "$TESTLOG"

# 2. Capturar PID do processo
PID=$(pm2 pid bot-wpp 2>/dev/null)
echo "PID do bot-wpp: $PID" | tee -a "$TESTLOG"

# 3. Capturar timestamp atual para buscar logs depois
BEFORE_TS=$(date '+%Y-%m-%d %H:%M:%S')
echo "Timestamp antes da desconexão: $BEFORE_TS" | tee -a "$TESTLOG"
echo "" | tee -a "$TESTLOG"

# 4. Desconexão controlada via endpoint de laboratório
echo "--- 2. DESCONEXÃO CONTROLADA ---" | tee -a "$TESTLOG"
echo "Enviando comando de desconexão..." | tee -a "$TESTLOG"

# Usar o endpoint /test com comando especial para desconectar
curl -s -X POST "http://127.0.0.1:$PORT/test"   -H 'Content-Type: application/json'   -d '{"platform":"whatsapp","command":"__disconnect_socket","chatId":"202658048684056@lid"}' 2>/dev/null | tee -a "$TESTLOG"
echo "" | tee -a "$TESTLOG"

# 5. Aguardar reconnect
echo "--- 3. AGUARDANDO RECONNECT (30s) ---" | tee -a "$TESTLOG"
for i in $(seq 1 30); do
  sleep 1
  if grep -q "Submódulos sincronizados" "$LOG" 2>/dev/null; then
    LAST_SYNC=$(grep "Submódulos sincronizados" "$LOG" | tail -1)
    if [[ "$LAST_SYNC" > *"$BEFORE_TS"* ]] || [[ "$LAST_SYNC" == *"$BEFORE_TS"* ]]; then
      echo "Reconnect detectado após ${i}s: $LAST_SYNC" | tee -a "$TESTLOG"
      break
    fi
  fi
  if [ $i -eq 30 ]; then
    echo "TIMEOUT: reconnect não detectado em 30s" | tee -a "$TESTLOG"
  fi
done

echo "" | tee -a "$TESTLOG"

# 6. Verificar estado pós-reconnect
echo "--- 4. ESTADO PÓS-RECONNECT ---" | tee -a "$TESTLOG"
curl -s "http://127.0.0.1:$PORT/lab/adapter?platform=whatsapp" 2>/dev/null | tee -a "$TESTLOG"
echo "" | tee -a "$TESTLOG"

# 7. Verificar logs de reconnect
echo "--- 5. LOGS DE RECONNECT ---" | tee -a "$TESTLOG"
grep -E "Conexão encerrada|reconnect|Reconectando|Conectado como|Submódulos sincronizados|readyState" "$LOG" | tail -20 | tee -a "$TESTLOG"
echo "" | tee -a "$TESTLOG"

# 8. Testar $ping pós-reconnect
echo "--- 6. TESTE $ping PÓS-RECONNECT ---" | tee -a "$TESTLOG"
curl -s -X POST "http://127.0.0.1:$PORT/test"   -H 'Content-Type: application/json'   -d '{"platform":"whatsapp","command":"$ping","chatId":"202658048684056@lid"}' 2>/dev/null | tee -a "$TESTLOG"
echo "" | tee -a "$TESTLOG"

sleep 5
echo "Log após $ping:" | tee -a "$TESTLOG"
grep -E "Pong|ping|reply.*ping|readyState" "$LOG" | tail -10 | tee -a "$TESTLOG"
echo "" | tee -a "$TESTLOG"

# 9. Testar $menu pós-reconnect
echo "--- 7. TESTE $menu PÓS-RECONNECT ---" | tee -a "$TESTLOG"
curl -s -X POST "http://127.0.0.1:$PORT/test"   -H 'Content-Type: application/json'   -d '{"platform":"whatsapp","command":"$menu","chatId":"202658048684056@lid"}' 2>/dev/null | tee -a "$TESTLOG"
echo "" | tee -a "$TESTLOG"

sleep 5
echo "Log após $menu:" | tee -a "$TESTLOG"
grep -E "menu|Comandos|reply.*menu|readyState" "$LOG" | tail -10 | tee -a "$TESTLOG"
echo "" | tee -a "$TESTLOG"

# 10. Testar $help pós-reconnect
echo "--- 8. TESTE $help PÓS-RECONNECT ---" | tee -a "$TESTLOG"
curl -s -X POST "http://127.0.0.1:$PORT/test"   -H 'Content-Type: application/json'   -d '{"platform":"whatsapp","command":"$help","chatId":"202658048684056@lid"}' 2>/dev/null | tee -a "$TESTLOG"
echo "" | tee -a "$TESTLOG"

sleep 5
echo "Log após $help:" | tee -a "$TESTLOG"
grep -E "help|Ajuda|reply.*help|readyState" "$LOG" | tail -10 | tee -a "$TESTLOG"
echo "" | tee -a "$TESTLOG"

# 11. Verificar se houve readyState !== OPEN
echo "--- 9. VERIFICAÇÃO DE ERROS ---" | tee -a "$TESTLOG"
ERRORS=$(grep "readyState !== OPEN" "$LOG" | wc -l)
echo "Total de readyState !== OPEN: $ERRORS" | tee -a "$TESTLOG"

CLOSED=$(grep "Connection Closed" "$LOG" | wc -l)
echo "Total de Connection Closed: $CLOSED" | tee -a "$TESTLOG"

echo "" | tee -a "$TESTLOG"
echo "=== FIM DO TESTE ===" | tee -a "$TESTLOG"
echo "Timestamp: $(date)" | tee -a "$TESTLOG"
