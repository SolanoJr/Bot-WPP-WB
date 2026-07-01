# PROJECT_MEMORY.md - Bot-WPP Multi-Platform

## 🎯 OBJETIVO DO PROJETO

**Unificação Multiplataforma:** Expandir as funcionalidades do bot de WhatsApp para Telegram e Discord, com arquitetura unificada.

**Interoperabilidade:** Criar ponte de comunicação (relay) entre plataformas (encaminhamento de mídia/mensagens entre grupos).

**Sincronização:** Manter codebase 100% sincronizado entre Linux (servidor de produção), Windows (desenvolvimento) e Git.

---

## 🏗️ ARQUITETURA

### Estrutura Multi-Plataforma

```
src/platforms/
├── base/
│   └── PlatformTypes.ts      # Interfaces unificadas (PlatformClient, PlatformMessage, etc.)
├── PlatformManager.ts        # Singleton gerenciador de todas as plataformas
├── whatsapp/
│   ├── WhatsAppAdapter.ts    # Wrapper do whatsapp-web.js
│   └── index.ts
├── telegram/
│   └── TelegramAdapter.ts    # Wrapper do telegraf
└── discord/
    └── DiscordAdapter.ts     # Wrapper do discord.js
```

### Padrão Adapter

Cada plataforma implementa `PlatformAdapter` com:
- `PlatformClient`: Interface unificada (sendMessage, getChat, onMessage, etc.)
- `PlatformMessage`: Mensagem normalizada com prefixo de plataforma (wpp:, tg:, dc:)
- `CommandContext`: Contexto unificado para execução de comandos

### PlatformManager

Singleton que:
- Gerencia múltiplas plataformas simultaneamente
- Normaliza IDs com prefixos (wpp:, tg:, dc:)
- Executa comandos de forma agnóstica
- Suporta broadcast entre plataformas
- Registry de comandos global

---

## 🔐 INFRAESTRUTURA E CREDENCIAIS

### Servidor Linux (Produção)
- **SSH:** `solanojr@100.101.218.16`
- **Sudo:** `2020`
- **PM2:** Process manager para bot
- **Diretório:** `/home/solanojr/bot-wpp`

### Números e Tokens
- **Bot WhatsApp:** +55 85 8134-4211
- **Meu Número:** +55 88 9831-4322
- **Telegram Token:** Configurado (ver `.env`)
- **Discord:** App ID, PubKey, Token configurados (ver `.env`)
- **AI (Gemini):** Key configurada (ver `.env`)

**IMPORTANTE:** Credenciais sensíveis estão em `.env` e NUNCA devem ser commitadas.

---

## 📁 ESTRUTURA DE PASTAS

```
bot-wpp/
├── src/
│   ├── platforms/          # Arquitetura multi-plataforma
│   ├── bot/               # Comandos e lógica do bot
│   │   └── commands/      # Comandos TypeScript
│   ├── services/          # Serviços compartilhados
│   ├── relay/             # Servidor relay para cross-platform
│   ├── core/              # Entry point unificado
│   └── shared/            # Tipos compartilhados
├── services/              # Serviços JavaScript legados (em migração)
├── tests/                 # Testes unitários e integração
├── dist/                  # Build compilado (tsup)
├── .wwebjs_auth/          # Sessão WhatsApp
├── ecosystem.config.js    # Configuração PM2
└── package.json           # Dependências e scripts
```

---

## 🚀 SCRIPTS DE BUILD

```json
{
  "build": "npm run build:relay && npm run build:services && npm run build:bot && npm run build:main && npm run build:core",
  "build:relay": "tsup src/relay/server.ts --out-dir dist/relay --format cjs",
  "build:services": "tsup src/services/*.ts --out-dir dist/services --format cjs",
  "build:bot": "tsup src/bot/index.ts src/bot/config.ts src/bot/customCommands.ts src/bot/relayClient.ts src/bot/commands/*.ts --out-dir dist/bot --format cjs",
  "build:main": "tsup src/whatsapp.ts --out-dir dist --format cjs",
  "build:core": "tsup src/core/index.ts --out-dir dist/core --format cjs"
}
```

**Nota:** `--clean` removido dos builds para evitar apagar `dist/bot` durante `build:main`.

---

## 🔄 FLUXO DE DEPLOY

### Windows → GitHub → Linux

1. **Windows (Desenvolvimento):**
   ```bash
   git add -A
   git commit -m "mensagem"
   git push origin main
   ```

2. **Linux (Produção):**
   ```bash
   cd /home/solanojr/bot-wpp
   git pull origin main
   npm install
   npm run build
   pm2 restart bot-wpp
   ```

### Verificação de Sync

```bash
# Windows
git status
git log --oneline -5

# Linux
git status
git log --oneline -5
pm2 status bot-wpp
```

---

## 🧪 TESTES

### Estrutura de Testes

```
tests/
├── setup.ts                 # Setup global de testes
├── unit/
│   ├── adapters.test.ts    # Testes de platform adapters
│   ├── commandConfigService.test.ts
│   ├── discordAdapter.test.ts
│   └── telegramAdapter.test.ts
└── integration/
    └── relay.test.ts
```

### Executar Testes

```bash
npm test              # Vitest run
npm run test:watch    # Vitest watch mode
```

---

## 📋 DIRETRIZES DE OPERAÇÃO

### Gestão de Memória

- Antes de qualquer alteração, buscar por arquivos de contexto ou pastas worktree
- Manter este arquivo `PROJECT_MEMORY.md` atualizado
- Usar `create_memory` para persistir decisões importantes

### Limpeza e Refatoração

- Autoridade para remover arquivos/pastas obsoletas
- Mesclar melhores ideias de diferentes branches
- Limpar no git, Windows e Linux qualquer arquivo redundante
- Remover core dumps e arquivos temporários regularmente

### Interatividade

- Se houver dúvida sobre implementação, perguntar antes de executar
- Testar alterações em ambiente de desenvolvimento antes de produção

---

## 🎨 MELHORES PRÁTICAS

### TypeScript

- **100% TypeScript** para código novo em `src/`
- Tipos estritos habilitados no `tsconfig.json`
- Interfaces unificadas em `src/shared/types.ts`
- Usar `PlatformTypes.ts` para código multi-plataforma

### Padrões de Código

- **Adapter Pattern** para integração de plataformas
- **Singleton Pattern** para PlatformManager e serviços globais
- **Dependency Injection** para testabilidade (ex: commandConfigService)
- **Error Handling** com try-catch e logging apropriado

### Segurança

- Credenciais em `.env` (NUNCA commitar)
- Validação de permissões em comandos sensíveis
- Sanitização de inputs de usuários
- Rate limiting para comandos (implementação pendente)

---

## 📊 HISTÓRICO DE DECISÕES

### 2026-07-01: Arquitetura Multi-Plataforma

**Decisão:** Implementar arquitetura unificada para WhatsApp, Telegram e Discord.

**Justificativa:**
- Código duplicado entre plataformas
- Dificuldade de manutenção
- Impossibilidade de cross-platform relay

**Implementação:**
- `PlatformManager` como singleton global
- `PlatformAdapter` pattern para cada plataforma
- Normalização de IDs com prefixos (wpp:, tg:, dc:)
- Registry de comandos global

**Resultado:**
- +16k linhas de código
- 101 arquivos modificados
- Arquitetura escalável para novas plataformas

### 2026-07-01: Build Process

**Decisão:** Remover `--clean` dos scripts de build.

**Problema:** `build:main` estava apagando `dist/bot` compilado anteriormente.

**Solução:** Remover `--clean` de todos os scripts exceto quando necessário.

### 2026-07-01: Command Config Service

**Decisão:** Implementar `commandConfigService` in-memory para enable/disable de comandos.

**Justificativa:**
- Remover dependência de lowdb
- Simplificar testes
- Melhor performance

**Implementação:**
- In-memory Map para grupos
- Métodos síncronos para simplicidade
- Wrappers async para compatibilidade

---

## ⚠️ PROBLEMAS CONHECIDOS

### Vulnerabilidades Dependabot

- **1 vulnerabilidade low** em dependências
- Recomendação: Não atualizar sem testes extensivos
- `whatsapp-web.js` é sensível a updates

### Arquivos JavaScript Legados

- `services/` ainda contém arquivos `.js` originais
- Bot atual usa alguns serviços JavaScript
- **Plano:** Migrar gradualmente para TypeScript em `src/services/`

### Sincronização de Sessão

- `.wwebjs_auth/` contém sessão WhatsApp
- Não deve ser commitada
- Backup necessário antes de limpeza

---

## 🔧 MANUTENÇÃO

### Limpeza Regular

```bash
# Linux
cd /home/solanojr/bot-wpp
rm -f core.*
rm -rf session/
pm2 flush
```

### Monitoramento

```bash
# Status do bot
pm2 status bot-wpp
pm2 logs bot-wpp --lines 50

# Uso de recursos
pm2 monit
```

### Backup

- Backup de `.wwebjs_auth/` antes de limpeza
- Backup de `.env` (local, não commitado)
- Git tags para versões estáveis

---

## 📝 CHECKLIST DE DEPLOY

Antes de deploy para produção:

- [ ] Testes passando (`npm test`)
- [ ] Build sucesso (`npm run build`)
- [ ] Git sync (Windows = GitHub)
- [ ] Credenciais configuradas no Linux
- [ ] Backup de sessão WhatsApp
- [ ] PM2 configurado corretamente
- [ ] Logs de erro verificados
- [ ] Comandos críticos testados ($ban, $shutdown)

---

## 🎯 PRÓXIMOS PASSOS

### Curto Prazo
- [ ] Migrar serviços JavaScript para TypeScript
- [ ] Implementar rate limiting
- [ ] Adicionar mais testes de integração
- [ ] Documentar API do relay

### Médio Prazo
- [ ] Implementar cross-platform relay funcional
- [ ] Adicionar dashboard de monitoramento
- [ ] Implementar sistema de permissões granular
- [ ] Adicionar suporte a mais plataformas

### Longo Prazo
- [ ] Microserviços para escalabilidade
- [ ] Sistema de plugins
- [ ] AI avançada para comandos
- [ ] Multi-tenancy

---

## 🔄 AUDITORIA 2026-07-01 (Sessão 2)

### Status do Sistema
- ✅ **Bot Online no Linux** (PM2: online, uptime estável)
- ✅ **WhatsApp**: Gerando QR Code (pronto para escanear)
- ✅ **Telegram**: Adapter registrado com sucesso
- ⚠️ **Discord**: Não inicializou nos logs (verificar configuração de intents)
- ✅ **45 Comandos carregados** incluindo `$menu`

### Limpezas Realizadas
- 🧹 **Core dumps removidos**: ~1.38TB de arquivos de crash limpos
- 🧹 **Logs PM2 limpos**: Mensagens de erro antigas removidas
- 🧹 **Build limpo**: `dist/` completamente reconstruído
- 🧹 **Git sincronizado**: Windows e Linux no commit 6e33806

### Correções Aplicadas
1. **.env Windows atualizado**: Adicionados `TELEGRAM_BOT_TOKEN` e `DISCORD_BOT_TOKEN`
2. **Rebuild completo**: Removidos arquivos compilados obsoletos
3. **PM2 logs flush**: Eliminadas mensagens de erro fantasma

### Próximos Passos para Uso
1. Escanear QR Code do WhatsApp no celular
2. Testar comando `$menu` no WhatsApp
3. Testar comando `$menu` no Telegram (após conexão)
4. Investigar inicialização do Discord (verificar logs de erro)

---

**Última Atualização:** 2026-07-01 (Auditoria Completa)
**Responsável:** WarriorBlack  
**Versão:** 1.0.1
