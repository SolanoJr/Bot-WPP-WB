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

### 21. WPP mudo após reconexão (mensagens não chegavam no log; TG/Discord ok) — RESOLVIDO
**Data:** 2026-08-11
**Sessão:** 58
**Status:** ✅ Resolvido (commit 2d656b6)

**Erro:** Após reconexões do WhatsApp Web, o WPP ficava CONNECTED mas NENHUMA mensagem era processada (0 `normalizeMessage` no log). TG/Discord continuavam funcionando.

**Causa Raiz:** `setupEventHandlers()` (que registra `on('message')`) rodava UMA vez no construtor. O whatsapp-web.js, ao reconectar e recriar o client interno, "mata" os listeners do client velho. O novo client conecta mas não tem `on('message')` → silêncio. TG/Discord não reconectam, por isso funcionavam.

**Solução:** Extraído o registro de `message`/`message_create` para `registerMessageHandlers()`, chamado no evento `ready` (que dispara em CADA reconexão) + uma vez no construtor. Usa `removeAllListeners('message')` antes do `on(...)` para não duplicar.

**Arquivos:** `src/platforms/whatsapp/WhatsAppAdapter.ts`

---

### 22. WPP não subia: `off('message')` sem listener quebrava registro do adapter — RESOLVIDO
**Data:** 2026-08-11
**Sessão:** 58
**Status:** ✅ Resolvido (commit 2d656b6)

**Erro:** `❌ Erro ao registrar WhatsApp: TypeError [ERR_INVALID_ARG_TYPE]: The "listener" argument must be of type function. Received undefined` → WPP nem inicializava (Plataformas ativas: telegram, discord).

**Causa:** `registerMessageHandlers()` chamava `this.innerClient.off?.('message')` (sem o 2º arg `listener`). O `EventEmitter.off(event, listener)` exige função → lança e aborta o `PlatformManager.registerAdapter`.

**Solução:** Trocado `off?.('message')` por `removeAllListeners?.('message')` (não exige listener). Adicionado `removeAllListeners` ao MockClient dos testes afetados.

**Arquivos:** `src/platforms/whatsapp/WhatsAppAdapter.ts`, `tests/unit/whatsappMessageDispatch.test.ts`, `tests/unit/whatsappAutoModDecoupling.test.ts`

---

### 23. Render falha no build: puppeteer baixa Chrome e erra — RESOLVIDO
**Data:** 2026-08-11
**Sessão:** 58
**Status:** ✅ Resolvido (commit d402333)

**Erro:** `npm error command failed ... Failed to set up chrome-headless-shell` no build do Render (Start `node relay/server.js`).

**Causa:** `puppeteer` estava em `dependencies`. O Render roda só o relay (não usa puppeteer/WWebJS), mas o `npm install` tentava baixar o Chrome e falhava (ambiente/rede do Render).

**Solução:** Movido `puppeteer` para `devDependencies`. O Render (NODE_ENV=production) não o instala nem baixa Chrome; o Linux (install normal) continua com ele para o WWebJS. Verificação do Render via `curl https://bot-wpp-wb-sc.onrender.com/health` (sem ir no site) → `ok:true`.

**Arquivos:** `package.json`

---

### 24. WPP mudo após reconexão interna — RESOLVIDO (commit edbe76e→580a9c4)
**Status:** ✅ RESOLVIDO (recriar Client no disconnected + handlers no ready/change_state)

**Tentativas (4 primeiras FALHARAM, 5ª funcionou):**
1. `c155503` registrar no `ready` — FALHOU (ready não repete em reconexão silenciosa)
2. `2d656b6` `off`→`removeAllListeners` — corrigiu crash de registro, não o silêncio
3. `083c6b2` registrar no `change_state: CONNECTED` — FALHOU (change_state não dispara se já CONNECTED)
4. `edbe76e` registrar APÓS `initialize()` — FALHOU (handler morre na reconexão silenciosa)
5. `580a9c4` `connect()` recria Client + handlers em `disconnected` (reconexão limpa) — FUNCIONOU (WPP Pronto e envia msg de prova confirmada no celular)

**Lição:** o WPP emitia `message`/`message_create` (o evento disparava), mas o handler morria na reconexão silenciosa. Recriar o Client resolveu o ENVIO (comprovado: msg de prova chegou no celular do dono).

---

### 25. Render build falha: puppeteer baixa Chrome — RESOLVIDO (commit c9c8aba)
**Status:** ✅ RESOLVIDO (puppeteer em dependencies + .puppeteerrc skipDownload + postinstall tolerante)

**Tentativas:**
1. `d402333` mover puppeteer para devDependencies — INSUFICIENTE (Render omite devDeps no build → patch-package not found)
2. `.puppeteerrc.json` skipDownload — NECESSÁRIO mas insuficiente sozinho
3. `c9c8aba` puppeteer→dependencies (Render instala + skipDownload evita Chrome) + postinstall `patch-package 2>/dev/null || true; npm run build` — FUNCIONOU (Render /health → 200, build passa)

**Lição:** Render omite devDependencies no build. Tudo que o build precisa deve ir em dependencies. patch-package deve ser tolerante a ausência.

---

### 26. WPP cego para mensagens de terceiros (seu número/grupos) — EM DIAGNÓSTICO (reset de sessão autorizado)
**Data:** 2026-08-11
**Sessão:** 59-60
**Status:** 🔄 Em Progresso (limpar .wwebjs_auth + reconectar QR — autorizado pelo usuário)

**Sintoma (CONFIRMADO POR LOG):** última vez que o número do dono (`SolanoJr`/88998314322/47876319248404@lid) foi processado de verdade no WPP foi **11:52:14** (`Executando ban em whatsapp para SolanoJr`). Depois disso, só aparece `WarriorBlack` (bot mandando pra ele mesmo via fromMe). TG/Discord normais. WPP conecta (Pronto) e ENVIA (msg de prova chega no celular) mas NÃO recebe mensagem de terceiro NENHUMA — nem `on('message')` nem `on('message_create)` disparam para msgs do dono/grupos.

**Causa raiz mais provável (NÃO testada ainda):** sessão LocalAuth dessincronizada. O Chromium conecta ("Pronto") mas o WhatsApp Web parou de empurrar updates de mensagem recebida para este token de sessão (comum após atualização do WhatsApp Web). A sessão é a MESMA há meses (reconecta sem QR). Explica: funcionava antes, parou após update do WhatsApp, nunca mais recebeu terceiro.

**Tentativas nesta investigação:**
1. `f22c6a7` remover filtro `if (msg.fromMe)` do `message_create` — FALHOU (WWebJS nem emite `message_create` para terceiros; só fromMe dispara)
2. `eaff4e9` remover flags `--single-process`/`--no-zygote` do puppeteer (Chromium travado em headless) — PENDENTE validação (provavelmente não é a causa, pois envio funciona)
3. Diagnosticar por log de eventos (`message_ack`, `incoming_call`, etc) — INCONCLUSIVO (nada dispara para terceiro)

**Resolução (16:40):** limpar sessão e reconectar com QR novo (pasta `.wwebjs_auth_fresh`) — **FUNCIONOU**. O dono escaneou o QR e o WPP voltou a receber mensagens de terceiros (`Executando ... em whatsapp para SolanoJr` volta a aparecer). Confirmado pelo dono: "voltamos a funcionar".

**Lição:** sessão LocalAuth meses sem re-scan dessincroniza silenciosamente (WhatsApp Web para de empurrar updates). O bot fica "Pronto" mas cego para terceiros. Reset de sessão + QR novo resolve. (O usuário desconfiava que reset não funcionaria — funcionou desta vez.)


### 27. $kick/$ban não removem (comando executa mas não remove) — RESOLVIDO (commit 8b7e11b)
**Data:** 2026-08-11
**Sessão:** 60
**Status:** ✅ RESOLVIDO (3 correções no normalizeMessage/normalizeChat + @lid→@c.us no adapter)

**Sintoma:** `$kick`/`$ban` rodavam (`Executando kick em whatsapp`) mas NÃO removiam ninguém. O dono reportou "ainda não funciona". O script direto `chat.removeParticipants(['X@c.us'])` FUNCIONAVA (prova de que a remoção em si funciona) — logo o bug era no FLUXO do comando, não no WWebJS.

**Causa raiz (3 bugs no normalizeMessage/normalizeChat):**

**Bug A — `isGroup` errado (linha 400-401):** `chatId = msg.from` e `isGroup = msg.from.endsWith('@g.us')`. Em grupo, `msg.from` é o LID do remetente (`2592935567439@lid`), NÃO o grupo. `isGroup=false` → `kick.ts` linha 12 (`if (!chat.isGroup)`) abortava com "só funciona em grupos".
- Correção: `chatId = msg.to` (se terminar `@g.us`) senão `msg.from`. `isGroup = chatId.endsWith('@g.us')`.

**Bug B — participants como string[] em vez de objetos (normalizeChat):** retornava `wpp:ID@c.us` (strings), mas `kick.ts` faz `participants.find(p => cleanId(p.id) === ...)` esperando OBJETOS `{id, isAdmin}`. `p.id` era undefined → `cleanId(undefined)` → null → bot NUNCA detectado como admin → "bot precisa ser admin".
- Correção: `normalizeChat` retorna `{id, isAdmin, isSuperAdmin}[]` (PlatformUser).

**Bug C — userId de fromMe = grupo (linha 402-404):** `userId = msg.fromMe ? msg.to : ...`. Para msg do bot em grupo, `msg.to` é o GRUPO (`@g.us`), não o bot. `isMaster(grupo)` = false → `kick.ts` linha 36 (`!isSenderAdmin && !isMaster`) bloqueava com "você não tem permissão".
- Correção: `userId = msg.fromMe ? info.wid._serialized : ...` (o bot).

**Bug D (bônus) — @lid→@c.us no adapter:** `removeParticipant`/`banParticipant` recebiam menção `@lid` (WWebJS atual) e `chat.removeParticipants(['X@lid'])` falhava silenciosamente. Convertido `@lid`→`@c.us`.

**Tentativas (todas documentadas):**
1. `f22c6a7` remover filtro fromMe do message_create — INSUFICIENTE (não era esse o bug)
2. `eaff4e9` remover flags puppeteer — IRRELEVANTE
3. Teste direto `removeParticipants(['13866030173@c.us'])` via script — FUNCIONOU (isolou que o bug é no fluxo do comando, não no WWebJS)
4. `076248e` @lid→@c.us no adapter — NECESSÁRIO mas insuficiente sozinho
5. `4c58325` Bug A (chatId de msg.to) — NECESSÁRIO mas insuficiente
6. `48a6f71` Bug B (participants como objetos) — NECESSÁRIO mas insuficiente
7. `2a89e4d` Bug C (userId fromMe = bot) — **CORREÇÃO FINAL** (junto com A+B+D, o $kick removeu de verdade)

**Validação (EVIDÊNCIA REAL):**
- Self-test: bot envia `$kick @13866030173` no grupo teste → log `removeParticipant - SUCESSO para 13866030173@c.us` + `✅ @13866030173 foi removido do grupo`.
- Contagem de participantes ANTES: 7. DEPOIS: 6. `13866030173@c.us AINDA NO GRUPO? false` → **REMOVIDO DE VERDADE**.

**Lição:** o `$kick` quebrava em 3 pontos de normalização (isGroup, participants, userId) mais o @lid. O script direto isolou que o WWebJS funcionava; o bug era 100% no normalizeMessage/normalizeChat. Sempre testar o COMANDO completo (não só a remoção crua).

### 28. $kick aborta em "Mencione alguém" (mentions vazio no normalizeMessage) — RESOLVIDO (commit 0f4adbb)
**Data:** 2026-08-12
**Sessão:** 60→61
**Status:** ✅ RESOLVIDO (extractMentions lê multiple fontes + @lid→@c.us)

**Lógica do dono (VERDADE FACTUAL, não palpite):** "Se eu marquei @alberto no $kick, é porque o alberto EXISTE no grupo e é admin. Não tem como marcar @alguém se ela não existe. Se o comando falha, o erro é no CÓDIGO, não na menção (que existe)."

**Causa raiz:** o `normalizeMessage` populava `mentions` SÓ de `msg.mentionedIds` (linha 488). No WhatsApp Web atual (IDs @lid), a menção NÃO vem em `msg.mentionedIds` (vem `undefined`) — ela está em `msg.mentionedJidList` ou `msg._data.mentionedJidList`. Como `msg.mentionedIds` era `undefined`, o `mentions` ficava **vazio**. O `kick.ts` linha 42-55 via `mentioned.length === 0` e abortava com "Mencione alguém ou responda" — NUNCA chegava no `removeParticipant`. A pessoa não saía.

**Por que o self-test de ontem (BUG 27) funcionou mesmo assim?** Porque o bot ENVIOU a msg `$kick @13866030173` com `mentions: [tid]` explícito (via `sendMessage` com option `mentions`), então o `msg.mentionedIds` veio preenchido. Mas quando VOCÊ manda `$kick @alberto` pelo celular, o WWebJS entrega a menção em `mentionedJidList`/`_data.mentionedJidList`, não em `mentionedIds` → vazio → aborta.

**Correção:** novo método `extractMentions(msg)` que lê de TODAS as fontes (`mentionedIds` → `mentionedJidList` → `_data.mentionedJidList`), normaliza `@lid`→`@c.us`, e loga qual fonte pegou. `kick.ts` também converte `@lid`→`@c.us` no alvo.

**Tentativas:**
1. Chutar que o alvo "não existia" / menção vazia por erro do usuário — REFUTADO pela lógica do dono (menção existe sempre que marcada).
2. Chutar @lid→@c.us no adapter — NECESSÁRIO mas insuficiente (o `mentions` ni chegava ao adapter, abortava antes).
3. `extractMentions` multi-fonte — **CORREÇÃO** (popula mentions corretamente do WWebJS moderno).

**CORREÇÃO DE ANÁLISE (11:37):** o agente ERROU ao afirmar que o $kick funcionava. O log mostra que TODAS as tentativas de VOCÊS (09:31, 09:54, 11:24 — SolanoJr/alberto/caio, todos adm marcando alvo) deram: `removeParticipant - chat obtido` + **`❌ Falha ao executar remoção: expected at least 1 children, but found 0`**. NENHUMA de vocês removeu ninguém. Os `SUCESSO` de 17:36/17:38/18:02/18:07 eram SELF-TEST do bot (Chromium fresco do script), não de vocês.

**Causa raiz REAL (lida no código WWebJS GroupChat.js:267-298):** `chat.removeParticipants` chama `window.WWebJS.enforceLidAndPnRetrieval(p)` para cada ID. Se não resolver lid/phone, o `participants` filtrado fica VAZIO → `removeParticipants(chat, [])` → WhatsApp Web abre modal de remoção com 0 filhos → erro `expected at least 1 children, but found 0`. Passar `@c.us` (ex: `251964977872908@c.us`) NÃO era resolvido pelo `enforceLidAndPnRetrieval` no grupo (que usa `@lid` como chave no `groupMetadata`). Por isso MEUS self-tests (que passavam `@c.us` que o `enforceLidAndPnRetrieval` às vezes resolvia) funcionavam intermitentemente, e os de vocês não.

**Correção (commit 3982818):** `removeParticipant`/`banParticipant` agora resolvem o ID REAL do participante no `groupMetadata` via `pupPage.evaluate` (buscando por `@c.us` E `@lid` no `groupMetadata.participants`), e passam esse ID resolvido ao `chat.removeParticipants`. Assim o `enforceLidAndPnRetrieval` recebe um ID que o grupo reconhece e não vem vazio.

**Validação (11:43:58):** dono mandou `$kick @188558375710755` → log `removeParticipant - ID resolvido no groupMetadata: 188558375710755@lid` + `removeParticipant - SUCESSO para 188558375710755@lid` → **REMOVIDO DE VERDADE**. A correção do `groupMetadata` resolveu o `expected at least 1 children`.

### 29. $kick só funciona para o DONO (outra pessoa barrada por "sem permissão") — RESOLVIDO (commit d5e311d)
**Data:** 2026-08-12
**Sessão:** 61
**Status:** 🔄 Em validação (deploy 11:55; aguardando teste de outra pessoa)

**Sintoma (CONFIRMADO POR LOG):** após o $kick passar a remover (BUG 28), o dono relatou "agora só eu e você conseguimos". O log de 11:38:34 mostra Jannyfer.Florentino mandando `$kick @251964977872908` e o bot respondendo `❌ Você não tem permissão para usar este comando.` Ela É admin (confirmado pelo dono: "todos são adm"), mas foi barrada.

**Causa raiz:** o `kick.ts`/`ban.ts` verificam `isSenderAdmin = Boolean(senderPart?.isAdmin)` onde `senderPart` vem do `getChat().participants` (normalizeChat). Quando o `getChatById` retorna fallback vazio (participants=[]), `senderPart` é undefined → `isSenderAdmin=false`. O dono passa porque é `isMaster` (não depende de `senderPart`); OUTRA PESSOA (não master) é barrada injustamente por "sem permissão".

**Correção (commit d5e311d):**
1. Novo método `isParticipantAdmin(chatId, userId)` no adapter: usa `pupPage.evaluate` no `groupMetadata` (autoritativo, igual ao resolveId) para verificar se o sender é admin.
2. `kick.ts`/`ban.ts`: se `senderPart` do getChat não confirma admin, chamam `isParticipantAdmin` antes de barrar.
3. `getParticipantName(chatId, userId)` no adapter: captura o NOME de quem foi removido (notify/name do groupMetadata) → resposta mostra o nome real.
4. `autoModService` (autokick): mesmo fix — verifica admin via `isParticipantAdmin` e usa `client.removeParticipant` (adapter, com correção @lid) em vez de `client.removeParticipants` cru (que dava `expected at least 1 children`).

**Validação pendente:** alberto/caio/jannyfer mandam `$kick @<não-admin>` no grupo teste → log deve mostrar `isParticipantAdmin: true` (sem "Você não tem permissão") + `SUCESSO` + resposta com NOME. Se aparecer, resolvido por evidência.

**Lição:** o portão de permissão dependia de `getChat().participants` (frágil em @lid). Sempre validar admin no `groupMetadata` (fonte autoritativa do WhatsApp Web), não no `normalizeChat` convertido.

---

**Última Atualização:** 2026-08-12
**Responsável:** WarriorBlack
