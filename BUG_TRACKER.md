# 🐛 Bug Tracker - WarriorBlack Bot

Este documento rastreia bugs, erros e suas soluções para evitar repetição de problemas.

---

## 📋 Índice

- [Bugs Recentes](#bugs-recentes)
- [Bugs Resolvidos](#bugs-resolvidos)
- [Padrões de Erros Comuns](#padrões-de-erros-comuns)
- [Soluções Recorrentes](#soluções-recorrentes)

---

## 🐛 Bugs Recentes

### 1. $ban - "mensagem inválida ou formato não suportado"
**Data:** 2026-07-08  
**Sessão:** 5  
**Status:** ✅ Resolvido

**Erro:**
```
[16:06, 08/07/2026] Caio: $ban @MI438722
[16:06, 08/07/2026] WarriorBlack: ❌ Erro: mensagem inválida ou formato não suportado.
```

**Causa:**
- O comando `$ban` foi convertido para usar `CommandContext` (formato novo do multi-plataforma)
- O sistema de migração em `src/bot/commands/index.ts` não estava convertendo corretamente para o formato legado
- A verificação `typeof msg.getChat !== 'function'` falhava porque o objeto msg não tinha o método

**Solução:**
- Reverteu o comando `$ban` para o formato legado `(msg, client, args)`
- Removeu a dependência de `CommandContext` do comando
- O sistema de migração em `index.ts` já suporta o formato legado

**Arquivo:** `src/bot/commands/ban.ts`

**Prevenção:**
- Ao converter comandos para o novo formato, testar sempre com o sistema de migração
- Verificar se o objeto msg tem os métodos necessários antes de usar

---

### 2. keywordHandler - Menções não respondidas
**Data:** 2026-07-08  
**Sessão:** 5  
**Status:** ✅ Resolvido

**Erro:**
- Bot não respondia quando mencionado "bot"
- Bot não respondia a marcações
- Bot não respondia quando digitavam "bot"

**Causa:**
- O `handleKeywords` só estava sendo chamado em `src/services/messageHandler.ts` (sistema legado)
- O bot estava usando o novo sistema multi-plataforma via `WhatsAppAdapter`
- O `WhatsAppAdapter` não chamava o `handleKeywords`

**Solução:**
- Adicionou import de `handleKeywords` em `src/platforms/whatsapp/WhatsAppAdapter.ts`
- Adicionou chamada de `handleKeywords` no evento `message` do `WhatsAppAdapter`
- Colocado após o AutoMod e antes do messageHandler

**Arquivo:** `src/platforms/whatsapp/WhatsAppAdapter.ts`

**Prevenção:**
- Ao adicionar novos handlers, verificar se funcionam em ambos os sistemas (legado e multi-plataforma)
- Documentar onde cada handler deve ser registrado

---

### 7. handleKeywords - "handleKeywords is not defined"
**Data:** 2026-07-10  
**Sessão:** 6  
**Status:** ✅ Resolvido

**Erro:**
```
[WhatsAppAdapter] Erro ao executar handleKeywords: handleKeywords is not defined
```

**Causa:**
- O `build:platforms` não estava no `package.json`
- O `WhatsAppAdapter.ts` não estava sendo compilado para `dist/platforms/`
- O código fonte tinha o import, mas o build não incluía o arquivo

**Solução:**
- Adicionou `build:platforms` ao `package.json`
- Adicionou script `tsup src/platforms/**/*.ts --out-dir dist/platforms --format cjs`
- Incluiu `build:platforms` no script principal `build`

**Arquivo:** `package.json`

**Prevenção:**
- Verificar se todos os arquivos TypeScript estão sendo compilados
- Testar build após adicionar novos imports

---

### 3. AutoMod - Mensagens interativas não detectadas
**Data:** 2026-07-08  
**Sessão:** 5  
**Status:** ✅ Resolvido

**Erro:**
- Spam em mensagens interativas/cards não era detectado
- Texto oculto em templates, botões e listas não era analisado

**Causa:**
- O AutoMod só analisava `msg.body`
- Mensagens interativas têm texto em propriedades internas (`_data.templateMessage`, `_data.buttonsMessage`, etc.)
- Não havia função para extrair texto de mensagens complexas

**Solução:**
- Criou função `extractTextFromInteractiveMessage` em `src/services/autoModService.ts`
- Extrai texto de: templateMessage, buttonsMessage, interactiveMessage, listMessage, productMessage
- Adicionou flag `filterInteractiveMessages` na configuração

**Arquivo:** `src/services/autoModService.ts`

**Prevenção:**
- Testar AutoMod com diferentes tipos de mensagens do WhatsApp
- Documentar quais tipos de mensagens são suportados

---

### 4. $pergunta - "API_KEY não configurada"
**Data:** 2026-07-08  
**Sessão:** 5  
**Status:** ✅ Resolvido

**Erro:**
```
[16:12, 07/07/2026] WarriorBlack: ⏳ Processando sua pergunta na IA...
[16:12, 07/07/2026] WarriorBlack: ⚠️ Erro: API_KEY não configurada. Verifique o arquivo .env.
```

**Causa:**
- O bot no Linux não tinha o código mais recente
- GEMINI_API_KEY já estava configurada no .env do Linux
- Falta de sincronização Windows -> Linux

**Solução:**
- Git pull no Linux
- Build no Linux
- PM2 restart no Linux

**Arquivo:** `.env` (Linux)

**Prevenção:**
- Sempre sincronizar git após mudanças
- Verificar se .env está atualizado em ambos os ambientes
- Documentar processo de sync no PROJECT_MEMORY.md

---

## ✅ Bugs Resolvidos (Histórico)

### 5. TypeScript - Property 'removeParticipants' does not exist on type 'Chat'
**Data:** 2026-07-08  
**Sessão:** 5  
**Status:** ✅ Resolvido

**Erro:**
```
Property 'removeParticipants' does not exist on type 'Chat'.
```

**Causa:**
- Tipos do whatsapp-web.js não incluíam o método `removeParticipants`
- TypeScript não reconhecia métodos adicionais

**Solução:**
- Usou cast `(chat as any).removeParticipants()`

**Arquivo:** `src/services/autoModService.ts`

**Prevenção:**
- Usar cast `any` para métodos não tipados do whatsapp-web.js
- Considerar contribuir com tipos para o projeto whatsapp-web.js

---

### 6. TypeScript - Property 'isViewOnce' does not exist on type 'Message'
**Data:** 2026-07-08  
**Sessão:** 5  
**Status:** ✅ Resolvido

**Erro:**
```
Property 'isViewOnce' does not exist on type 'Message'.
```

**Causa:**
- Tipos do whatsapp-web.js não incluíam a propriedade `isViewOnce`

**Solução:**
- Usou cast `(msg as any).isViewOnce || false`

**Arquivo:** `src/services/autoModService.ts`

**Prevenção:**
- Usar cast `any` para propriedades não tipadas
- Verificar documentação do whatsapp-web.js para métodos disponíveis

---

## 🔍 Padrões de Erros Comuns

### 1. Incompatibilidade entre Sistemas (Legado vs Multi-Plataforma)
**Sintomas:**
- Comandos não funcionam
- Handlers não são chamados
- Erros de tipo

**Causa:**
- O projeto tem dois sistemas: legado (whatsapp.ts) e multi-plataforma (WhatsAppAdapter)
- Mudanças em um sistema não são refletidas no outro

**Solução:**
- Sempre testar em ambos os sistemas
- Documentar onde cada funcionalidade deve ser implementada
- Considerar migrar completamente para multi-plataforma

### 2. Falta de Sincronização Windows -> Linux
**Sintomas:**
- Funciona no Windows mas não no Linux
- Erros de configuração
- Versões diferentes

**Causa:**
- Código não foi sincronizado via git
- .env diferente entre ambientes
- Build não foi executado

**Solução:**
- Sempre fazer git pull no Linux após mudanças
- Verificar .env em ambos os ambientes
- Executar build e PM2 restart

### 3. TypeScript Tipos Incompletos
**Sintomas:**
- Erros de compilação
- Property does not exist
- Type errors

**Causa:**
- Tipos do whatsapp-web.js não são completos
- Bibliotecas externas com tipos deficientes

**Solução:**
- Usar cast `any` quando necessário
- Criar tipos customizados se necessário
- Contribuir com tipos para projetos open source

---

## 🔧 Soluções Recorrentes

### Cast para any em whatsapp-web.js
```typescript
// Para métodos não tipados
await (chat as any).removeParticipants([userId]);

// Para propriedades não tipadas
const isViewOnce = (msg as any).isViewOnce || false;
```

### Verificação de método antes de usar
```typescript
if (!msg || typeof msg.getChat !== 'function') {
  await msg.reply("❌ Erro: mensagem inválida.");
  return;
}
```

### Sincronização Windows -> Linux
```bash
# Windows
git add -A
git commit -m "mensagem"
git push origin main

# Linux
ssh solanojr@100.101.218.16 "cd ~/bot-wpp && git pull origin main"
ssh solanojr@100.101.218.16 "cd ~/bot-wpp && npm run build"
ssh solanojr@100.101.218.16 "cd ~/bot-wpp && pm2 restart bot-wpp"
```

---

## 📝 Como Adicionar Novos Bugs

1. **Data:** Data do bug
2. **Sessão:** Número da sessão (se aplicável)
3. **Status:** 🐛 Aberto | 🔄 Em Progresso | ✅ Resolvido
4. **Erro:** Mensagem de erro ou descrição do problema
5. **Causa:** Análise da causa raiz
6. **Solução:** Passos para resolver
7. **Arquivo:** Arquivos modificados
8. **Prevenção:** Como evitar no futuro

---

**Última Atualização:** 2026-07-08  
**Responsável:** WarriorBlack
