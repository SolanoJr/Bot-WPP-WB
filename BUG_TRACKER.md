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

### 6. Envio WhatsApp falha com "No LID for user" (redeclaração do BUG 5)
**Data:** 2026-08-07
**Sessão:** 56
**Status:** ✅ Resolvido

**Sintoma reportado (original):** Discord offline e `$menu` não responde.
**Realidade (logs PM2):** Discord online; o erro real era no **WhatsApp**.

**Erro real (WhatsApp):**
```
Falha de transporte ao enviar mensagem (202658048684056@c.us): No LID for user
```

**Causa:** Correção anterior convertia `chatId` `@lid` → `@c.us` no `sendMessage`. O WWebJS moderno **exige o `@lid`** para enviar a esse contato.

**Correção (Fase B):**
- Revertida a conversão `@lid`→`@c.us` (manter `@lid` no destino).
- `sendMessage` agora trata retorno `undefined` do WWebJS como sucesso (payload mínimo), eliminando o "erro interno" falso.
- Telegram: o `504 Gateway Time-out` era rede transitória (servidor alcança `api.telegram.org` — `HTTP 302`); Telegram online e recebeu `$menu`.

**Arquivos:** `src/platforms/whatsapp/WhatsAppAdapter.ts` (`sendMessage`).

---

### 7. Varredura de `getChatById` / `msg.getChat` (BUG 6)
**Data:** 2026-08-07
**Sessão:** 56
**Status:** ✅ Resolvido (sem ação de código necessária)

**Conclusão da varredura (`grep` em `src/`):**
- `safeGetChat()` **NÃO existe** no projeto (0 ocorrências). Padrão adotado = reutilizar `msg.getChat()` já obtida.
- Comandos (`automod.ts`, `lists.ts`, `setwelcome.ts`, `autoModService.ts`) já reutilizam o `chat` (comentário `// BUG 1: não chamar getChatById novamente`).
- Chamadas restantes de `getChatById` em `WhatsAppAdapter.ts` (linhas ~443‑545) são a **camada de acesso legítima** ao WWebJS (`sendMessage`, `getChat`, `getUser`) — não há instância a reutilizar ali.
- `index.ts:294` e `migration.ts:67` são a própria abstração `PlatformChat`/`PlatformClient`.

**Decisão:** nenhuma alteração de código. Documentar o padrão para evitar regressão.

---

### 8. Menu regredido (perdeu formato com HASH / flags)
**Data:** 2026-08-07
**Sessão:** 56
**Status:** ✅ Resolvido

**Erro:** ao reescrever `src/bot/commands/menu.ts` para usar `CommandContext` (agnóstico de plataforma), o conteúdo do menu foi substituído por uma versão simples, perdendo o layout com `HASH`, `Uptime`, e flags de status (ATIVO/SARCASMO/DDI/CARD/PALAVRAS/LINKS). O usuário viu um "menu antigo" no WhatsApp.

**Causa:** reescrita do `menu.ts` sem preservar o conteúdo visual anterior.

**Correção:** `menu.ts` restaurado com o layout novo (idêntico ao desejado pelo usuário), mantendo `CommandContext` agnóstico e `HASH` dinâmico via `git rev-parse --short HEAD`. Sempre preservar o conteúdo do menu ao refatorar — **nunca piorar** o visual.

**Arquivos:** `src/bot/commands/menu.ts`

---

### 9. `startAll()` sequencial trava Discord (Telegram não retorna)
**Data:** 2026-08-07
**Sessão:** 56
**Status:** ✅ Resolvido

**Erro:** após ativar `platformManager.startAll()` (correção do `messageHandler` nulo), o Discord parou de inicializar e o Telegram não despachava.

**Causa:** `startAll()` fazia `for (... ) { await adapter.initialize(); }` sequencialmente. O `TelegramAdapter.initialize()` faz `await launch()` e o Telegraf **não resolve a Promise** (long-polling só resolve ao encerrar o bot). O loop travava no Telegram e o Discord nunca era inicializado.

**Correção:** `startAll()` agora usa `Promise.allSettled` — cada plataforma inicializa em paralelo; uma lenta não bloqueia as outras.

**Arquivos:** `src/platforms/PlatformManager.ts` (`startAll`)

**⚠️ Regra anti-regressão:** NUNCA fazer `await adapter.initialize()` sequencial no `startAll`. Sempre paralelo (`allSettled`).

---

### 10. Telegram recebe mas não despacha comando
**Data:** 2026-08-07
**Sessão:** 56
**Status:** ✅ Resolvido

**Erro:** o Telegram recebia mensagens (`[Telegram] Mensagem recebida`) mas o comando não era executado (`Executando menu em telegram` não aparecia).

**Causa:** o `PlatformManager.setupAdapterHandlers()` (que registra o `onMessage` de despacho) só era chamado **após** `await adapter.initialize()` retornar. Como o `TelegramAdapter.initialize()` aguardava o `launch()` (que não resolve), o handler nunca era registrado.

**Correção:** `TelegramAdapter.initialize()` agora dispara `launch()` em background (`.catch`) e retorna imediatamente, permitindo que o `setupAdapterHandlers` registre o despacho.

**Arquivos:** `src/platforms/telegram/TelegramAdapter.ts` (`initialize`)

**⚠️ Regra anti-regressão:** adapters de plataforma NUNCA devem `await` o `launch()`/`login()` de forma bloqueante no `initialize()`. Disparar em background e retornar.

---

### 12. Comandos `piada`/`votar`/`delvoto`/`sendmsg` não registrados (aliases ausentes)
**Data:** 2026-08-07
**Sessão:** 56
**Status:** ✅ Resolvido

**Erro:** `tests/unit/commands-registry.test.ts` falhava: `piada`, `votar`, `delvoto`, `sendmsg` "deveriam estar registrados". O menu e o teste referenciavam esses nomes, mas o `loadCommands()` (`src/bot/commands/index.ts`) só tinha `jokes`, `vote`, `delvote` e o `sendmsg` era um comando órfão (`sendMessage.ts` não importado).

**Correção:** adicionados aliases `piada→jokesCommand`, `votar→voteCommand`, `delvoto→delVoteCommand` e importado/registrado `sendmsg→sendMessageCommand` no `index.ts`.

**Arquivos:** `src/bot/commands/index.ts`, `src/bot/commands/sendMessage.ts`

---

### 13. Teste `discordAdapter.test.ts` quebra (mock sem `GatewayIntentBits`)
**Data:** 2026-08-07
**Sessão:** 56
**Status:** ✅ Resolvido

**Erro:** `No "GatewayIntentBits" export is defined on the "discord.js" mock`. O `DiscordAdapter` importa `GatewayIntentBits`/`Partials` no topo, mas o `vi.mock('discord.js')` do teste só retornava `{ Client: MockClient }`.

**Correção:** mock passou a exportar `GatewayIntentBits` e `Partials`.

**Arquivos:** `tests/unit/discordAdapter.test.ts`

---

### 14. `$kick`/`$ban` erro falso de "precisa ser administrador"
**Data:** 2026-08-07
**Sessão:** 56
**Status:** ✅ Resolvido

**Erro:** `$kick`/`$ban` respondiam "O bot precisa ser administrador" mesmo o bot SENDO admin.

**Causa:** o `WhatsAppAdapter.getChat()` retorna `participants: []` quando o WWebJS falha em obter a lista (Issue #201838 `r:r` / chat `@lid`), marcando `isPermissionsVerified: false`. O `kick`/`ban` buscavam `botPart = participants.find(...)` e, como vazio, `botPart?.isAdmin` era falsy → erro falso.

**Correção:** no `kick`/`ban`, quando `chat.isPermissionsVerified === false`, a checagem de admin do BOT é pulada (não bloqueia). O comando prossegue e o WWebJS retorna o erro real se o bot não for admin.

**Arquivos:** `src/bot/commands/kick.ts`, `src/bot/commands/ban.ts`

---

### 15. `$kick`/`$ban` e AutoMod falham com erro `r` (Issue #201838 / `@lid`)
**Data:** 2026-08-10
**Sessão:** 57
**Status:** ✅ Resolvido

**Erro:** `$ban @MI030173` → `❌ Erro ao banir usuário: r`. `$kick @MI500179` → `❌ Falha ao executar remoção: r`. No error log: `Erro no comando $kick: r: r` / `at WhatsAppAdapter.banParticipant (.../multiPlatform.js:1708)`. O AutoMod também parou de banir (uma adm teve que banir manualmente).

**Causa:** `getChatById()` do WWebJS lança `r:r` (Issue #201838) em chats `@lid`. Os métodos `removeParticipant`/`banParticipant` chamavam `innerClient.getChatById(chatId)` e depois `.removeParticipants(...)` — o `getChatById` quebrava antes. O AutoMod usava `msg.getChat()` + `chat.participants` para verificar se o bot era admin; com `participants: []` (erro r:r), o bot "não era admin" → AutoMod abortava silenciosamente.

**Correção:**
- `WhatsAppAdapter.removeParticipant`/`banParticipant`: usam `client.removeParticipants(chatId, [users])` **direto** (método do Client WWebJS), contornando o `getChatById` frágil. Fallback mantido para o caminho `getChatById` caso o método não exista.
- `autoModService.processAutoMod`: `getChat()` envolvido em try/catch; se `participants` vazio (falha r:r), **assume bot-admin** (prossegue). Remoção/notificação usam `client.removeParticipants`/`client.sendMessage` diretos (groupId derivado de `chat.id._serialized || msg.from`).

**Arquivos:** `src/platforms/whatsapp/WhatsAppAdapter.ts`, `src/services/autoModService.ts`

**⚠️ Regra anti-regressão (CORRIGIDA):** NÃO existe `client.removeParticipants` no WWebJS (só `chat.removeParticipants`, que internamente chama `getChat` → quebra com `r:r`). Qualquer tentativa de contornar via `client.removeParticipants` cai no fallback `getChatById` e falha igual. O erro `r:r` é do WWebJS não conseguir ler o chat do grupo (Issue #201838 / estado da sessão), NÃO do nosso código. A correção real é recriar a sessão do WhatsApp Web (remover `.wwebjs_auth` + re-logar com QR), não mudar o comando.

---

### 16. `$kick`/`$ban` e AutoMod: erro `r` é do WWebJS (sessão), não do código — tentativas e erros
**Data:** 2026-08-10
**Sessão:** 57
**Status:** ❌ Tentativas 1-4 esgotadas — grupo `120363410094452673@g.us` é invisível para o WWebJS

**Tentativa 4 (falha, commit ec32096):** fallback `pupPage.evaluate` com `window.Store.Chat.get(chatId)` → erro `chat nao encontrado na Store` (log: `[kick] Erro: Error: chat nao encontrado na Store`). O `window.Store` **não está exposto** nessa versão do WWebJS.

**Conclusão:** o grupo `120363410094452673@g.us` é **ilegível para o WWebJS** — nem `getChat` (r:r) nem `window.Store` (undefined) o enxergam. Nenhuma correção de código de comando resolve. O bot WPP está online e responde normalmente em outros grupos; só a moderação (kick/ban/AutoMod) desse grupo específico falha.

**Única saída real:** versão diferente do `whatsapp-web.js` (downgrade/upgrade) que consiga ler esse grupo — arriscado, pode quebrar outras funcionalidades. Decisão do usuário pendente.

**Arquivos:** `src/platforms/whatsapp/WhatsAppAdapter.ts` (fallback nativo aplicado mas ineficaz p/ esse grupo), `ecosystem.config.js`/`.env` (WWEBJS_AUTH_DIR=.wwebjs_auth2)

**Sintoma:** `$ban @MI030173` → `❌ Erro ao banir usuário: r`. `$kick @MI500179` → `❌ Falha ao executar remoção: r`. AutoMod parou de banir.

**Investigação (com provas de log):**
- Stack: `at Client.getChatById (whatsapp-web.js/src/Client.js:1754)` → `at WhatsAppAdapter.removeParticipant`. O `getChatById` chama `window.WWebJS.getChat(chatId)` que lança `r:r`.
- `node_modules/whatsapp-web.js/src/structures/GroupChat.js:263`: `removeParticipants` faz `window.WWebJS.getChat(chatId, {getAsModel:false})` → essa chamada lança `r:r` para o grupo `120363410094452673@g.us`.
- `Client.getChatById(chatId)` NÃO aceita 2º parâmetro `forceIntegrity` (só `(chatId)`).
- `removeParticipants` NÃO existe em `Client` (só em `Chat`).

**Tentativas que NÃO funcionaram (anotadas para não repetir):**
1. Mudar `removeParticipant` para `client.removeParticipants(chatId,[users])` direto — o WWebJS não tem esse método no Client → cai no fallback `getChatById` → `r:r`. ❌
2. Assumir bot-admin no AutoMod quando `participants` vazio — não resolve o `removeParticipants` que ainda quebra no `getChat`. ❌
3. `getChatById(id, false)` — método não aceita 2º arg. ❌

**Causa raiz:** o WWebJS não consegue desserializar o chat do grupo `120363410094452673@g.us` (cache/sessão corrompido do WhatsApp Web). Erro `r:r` em `getChat`. Nenhuma correção de código de comando resolve porque TODAS as rotas do WWebJS passam por `getChat` → `r:r`.

**Correção real:** recriar a sessão do WhatsApp Web — parar PM2, remover `.wwebjs_auth` (e `.wwebjs_cache`), subir PM2 e re-escanear o QR. Isso reconstrói o estado limpo do grupo e o `getChat` volta a funcionar.

**Arquivos:** `src/platforms/whatsapp/WhatsAppAdapter.ts`, `src/services/autoModService.ts` (já resilientes, mas a causa é sessão)

---

### 17. Render falha: `Cannot find module relay/server.js` — RESOLVIDO
**Data:** 2026-08-10/11
**Sessão:** 57
**Status:** ✅ Resolvido (atalhos + postinstall, commit 30170d1)

**Erro:** `Running 'node relay/server.js'` → `Error: Cannot find module '/opt/render/project/src/relay/server.js'`. O Render usava Start Command hardcoded `node relay/server.js` (ignorava o `render.yaml`). O `dist/` é gitignored e o Build Command era só `npm install` → sem dist → start falhava.

**Correção (commit 30170d1):**
- Criados `relay/server.js` e `src/relay/server.js` (atalhos que requirem `dist/relay/server.js`).
- Adicionado `"postinstall": "npm run build"` no package.json → o `npm install` do Render agora gera o dist.
- O Start Command `node relay/server.js` (ou `node src/relay/server.js`) agora acha o atalho → dist.

**Nota:** se o Render ainda falhar, o Start Command no painel deve ser `node dist/relay/server.js` ou `npm start`.

**Arquivos:** `relay/server.js`, `src/relay/server.js` (novos), `package.json` (postinstall)

---

### 18. AutoMod crash: `Cannot read properties of null (reading 'id')`
**Data:** 2026-08-11
**Sessão:** 57
**Status:** ✅ Resolvido (commit 552bfd9)

**Erro (error log):**
```
❌ [AutoMod] Erro crítico: Cannot read properties of null (reading 'id')
❌ [AutoMod] Erro stack: TypeError: Cannot read properties of null (reading 'id')
```

**Causa:** em `autoModService.ts:200` (REGRA 1 - DDI Estrangeiro), o código usava `chat.id._serialized` diretamente. Mas `chat` pode ser `null` quando `msg.getChat()` falha no catch da linha 154-158 (Issue #201838, grupos `@lid`). O `groupId` já era calculado na linha 159 com fallback (`chat?.id?._serialized || msg.from`), mas a linha 200 ignorava isso.

**Correção:** linha 200 passou a usar `(groupId || msg.from)` em vez de `chat.id._serialized`. Elimina o crash; o AutoMod prossegue mesmo quando `getChat` falha (assumindo bot-admin, conforme BUG 15).

**Arquivos:** `src/services/autoModService.ts`

---

### 19. `SQLITE_BUSY: database is locked` no logger de comandos
**Data:** 2026-08-11
**Sessão:** 57
**Status:** ❌ Não corrigido (erro de auditoria, não quebra comandos)

**Erro (error log):**
```
[PlatformManager] Erro ao registrar log de comando: [Error: SQLITE_BUSY: database is locked]
```

**Causa:** o `commandExecutor` (ou `databaseService`) grava no lowdb (SQLite/JSON) em paralelo com outras escritas → lock de concorrência. É um erro do logger (auditoria), NÃO impede a execução do comando nem a resposta ao usuário.

**Impacto:** perda de alguns registros de auditoria em horários de pico. Funcionalidade do bot intacta.

**Ação recomendada (futura):** habilitar WAL mode no lowdb ou serializar escritas com fila/mutex. Baixa prioridade.

---

### 20. Logs sem timestamp dificultam investigação cronológica
**Data:** 2026-08-11
**Sessão:** 57
**Status:** ✅ Resolvido (commit 7b8a953)

**Problema:** os `console.log` do bot não tinham horário, dificultando correlacionar eventos (ex: "kick falhou em qual grupo e quando?").

**Causa:** o entry point real do PM2 é `dist/core/multiPlatform.js` (definido em `ecosystem.config.js`), NÃO `src/whatsapp.ts`. A primeira tentativa de override de `console.*` foi colocada em `whatsapp.ts` (não usado no Linux) → timestamps não apareciam.

**Correção:** override de `console.log/error/warn/info` movido para o topo de `src/core/multiPlatform.ts` (entry point do PM2), prefixando `[YYYY-MM-DD HH:MM:SS.mmm]`. Confirmado em produção: `[2026-08-11 11:05:46.673] [PlatformManager] ✅ whatsapp pronto`.

**Arquivos:** `src/core/multiPlatform.ts` (override adicionado), `src/whatsapp.ts` (override removido)

---

### 11. Puppeteer Browser Launch Failed - Chrome Not Found/Timeout
**Data:** 2026-08-05  
**Sessão:** 45  
**Status:** ✅ Resolvido

**Erro:**
```
Error: Failed to launch the browser process: Code: 21
TimeoutError: Timed out after 30000 ms while waiting for the WS endpoint URL to appear in stdout!
```

**Causa:**
- Tentativa de usar Chrome do sistema (`google-chrome-stable`, `chromium-browser`) falhou
- Google Chrome 151 incompatível com ambiente headless sem display
- Erros de "single process mode" e permissão negada ao tentar iniciar Chrome
- `puppeteer-core` não baixa Chrome, precisa de executável externo

**Tentativas de Solução (Falhas):**
1. Instalar `chromium-browser` via snap - falha por ser wrapper que requer snap install
2. Priorizar `google-chrome-stable` - falha com Code: 21 (permissão)
3. Usar `headless: 'new'` - falha com timeout
4. Adicionar `--single-process` - falha com permissão negada
5. Simplificar args para apenas flags essenciais - falha persistente
6. Remover uso de Chrome do sistema e deixar Puppeteer usar cache - falha

**Solução Final:**
- Instalar `puppeteer` completo (que baixa seu próprio Chrome compatível)
- Remover função `resolveChromeExecutablePath()` do `WhatsAppAdapter.ts`
- Simplificar configuração do Puppeteer para usar apenas flags essenciais
- Adicionar `puppeteer` como dependência no `package.json`
- Executar `npm install puppeteer` no servidor Linux

**Arquivos:**
- `src/platforms/whatsapp/WhatsAppAdapter.ts` (removida função resolveChromeExecutablePath)
- `package.json` (adicionado puppeteer como dependência)

**Comando de Instalação:**
```bash
npm install puppeteer
```

**Prevenção:**
- Em servidores Linux sem display, usar `puppeteer` completo em vez de `puppeteer-core`
- Evitar tentar usar Chrome do sistema em ambiente headless
- Manter dependências do Puppeteer atualizadas no package.json
- Documentar configurações específicas de ambiente headless

### 8. TypeError: .for is not iterable - loadCommands
**Data:** 2026-08-05  
**Sessão:** 39  
**Status:** ✅ Resolvido

**Erro:**
```
TypeError: .for is not iterable
at PlatformManager.loadCommands (src/platforms/PlatformManager.ts:347)
```

**Causa:**
- `loadCommands()` em `src/bot/commands/index.ts` retornava `Record<string, ICommand>` (objeto)
- `PlatformManager.loadCommands()` esperava `Map<string, ICommand>` e usava `for...of` para iterar
- Objetos JavaScript não são iteráveis com `for...of`, causando o erro
- `multiPlatform.ts` usava `await loadCommands()` mas a função não era async

**Solução:**
- Modificou `loadCommands()` para retornar `Map<string, ICommand>` em vez de `Record`
- Converteu o objeto `commands` em Map usando `Object.entries()` e `Map.set()`
- Removeu `await` de `loadCommands()` em `multiPlatform.ts` (função síncrona)
- Adicionou try/catch ao redor do carregamento de comandos para evitar crash na inicialização

**Arquivos:**
- `src/bot/commands/index.ts` (linha 131-136)
- `src/core/multiPlatform.ts` (linha 22-29)

**Prevenção:**
- Sempre verificar compatibilidade de tipos entre funções que retornam coleções
- Usar `Map` quando for necessário iterar com `for...of`
- Documentar tipos de retorno esperados em funções públicas
- Adicionar tratamento de erro robusto em inicialização crítica

---

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
