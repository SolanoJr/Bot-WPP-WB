# 🧪 Laboratório - Scripts de Teste

Pasta para testes manuais e validações do bot.

## 📁 Arquivos

### `test-remover-bot.sh`
Script para testar remoção manual de bot spammer.

**Uso:**
```bash
cd /home/solanojr/bot-wpp
bash laboratorio/test-remover-bot.sh
```

**O que faz:**
1. Verifica se bot está no grupo
2. Bane permanentemente (banned_users)
3. Remove do grupo (kick)
4. Mostra logs de confirmação

### `test-bot-removal.ts`
Versão TypeScript do teste (para uso local/dev).

---

## 🎯 Casos de Uso

### Remover Bot Spammer Manualmente
```bash
bash laboratorio/test-remover-bot.sh
```

### Testar Comando $ping
No WhatsApp, enviar no grupo:
```
$ping
```

Deve retornar latência real (50-300ms).

### Ativar Antibot Automático
No WhatsApp, enviar no grupo:
```
$remover on
$detectar on
$remover status
```

---

## 📝 Adicionar Novos Testes

1. Criar script em `laboratorio/`
2. Documentar neste README
3. Testar em ambiente de dev/staging primeiro
4. Validar em produção

---

**Última atualização:** 2026-09-01
