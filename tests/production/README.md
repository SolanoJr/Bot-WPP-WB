# Testes de Produção

> Testes que executam diretamente no bot em produção via API HTTP.

## ⚠️ Aviso

Estes testes executam comandos reais no bot conectado. Use com responsabilidade.

## Requisitos

- Bot online e conectado à plataforma
- TestServer acessível (porta 3004)
- curl

## Como Usar

```bash
# Testar $menu no Discord
./tests/production/menu-test.sh discord localhost:3004

# Testar $menu no WhatsApp
./tests/production/menu-test.sh whatsapp localhost:3004

# Testar no servidor remoto
./tests/production/menu-test.sh discord 100.101.218.16:3004
```

## Resultados

Os resultados são salvos em `tests/production/results/` com timestamp.

## Scripts Disponíveis

| Script | Descrição |
|--------|-----------|
| `menu-test.sh` | Testa o comando `$menu` |
