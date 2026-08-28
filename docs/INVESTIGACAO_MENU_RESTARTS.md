# INVESTIGAÇÃO: $menu não responde no WhatsApp + reinícios do processo

> Documento de continuidade — investigação em andamento. NÃO alterar código/build/restart até conclusão.

## Última atualização
2026-08-07 (sessão de investigação, sem alterações de código)

## Resumo do estado comprovado
- Bot roda no Linux via PM2: processo 0 = `dist/core/multiPlatform.js` (script definido em `ecosystem.config.js`).
- `$menu` no WhatsApp chega ao `WhatsAppAdapter.on('message')` → roda `processAutoMod` → **processo reinicia antes de `handleKeywords`/`messageHandler`/`executeCommand`**.
- `dist` atual está correto: `menu.execute → ctx.reply(menu)` (multiPlatform.js:2267); `handleIncomingMessage` (582) + `createCommandContext` (664) presentes.
- Reinícios em rajada no log (`🚀 Inicializando Bot-WPP` nas linhas ~13463,13542,13588,13631,13677,63834,63885,63950).
- QR Code ASCII recorrente (45279 `█` após linha 13463) → WhatsApp Web desconectando/reconectando.
- Bug de metrics (`res.end(promise)`) JÁ CORRIGIDO no dist (linha 248 ok). Error log antigo era de 10:12, descartado.

## Evidência concreta (logs do processo 0)
- `bot-wpp-out-0.log` linhas 63936-63940 (seu $menu, sessão atual):
  ```
  63936 [WhatsAppAdapter] Mensagem recebida - msg.from: 202658048684056@lid msg.author: undefined
  63937 [AutoMod] ENTRY
  63938 [AutoMod] chat obtido: true chat.id._serialized: 202658048684056@lid
  63939 [AutoMod] authorId: 202658048684056@lid
  63939 [AutoMod] botPart: false botPart.isAdmin: undefined botPart.isSuperAdmin: undefined
  63940 🚀 Inicializando Bot-WPP Multi-Platform...   ← REINÍCIO
  ```
- 3 ocorrências do seu $menu na sessão atual (63936, 64001, 64015) — todas param no AutoMod e o processo reinicia.
- `pm2 status` (medição da sessão): online, uptime 38m, restarts: 4. Logo: na hora do teste o bot estava em janela de instabilidade; agora estável.

## CAUSA DOS REINÍCIOS (atualizada 2026-08-07)

### Evidências coletadas
- **PM2 describe 0**: `status: online`, `restarts: 4`, `unstable_restarts: 0`, `max_memory_restart: 1073741824` (1GB), `watch: false`, `autorestart: true`, `exit_code: 130` (processo anterior).
- **exit 130 = 128 + 2 = SIGINT** (pm2 stop/restart ou kill -2). NÃO é OOM (137/SIGKILL), NÃO é SIGTERM (143).
- **Heap**: 41.70 MiB total, 92% usage → absoluto baixo. **Descarta OOM de Node.**
- **multiPlatform NÃO usa whatsappSingleton** (legado/morto). Cria `new Client()` direto no WhatsAppAdapter (linha 57).
- **Nenhum código ativo chama process.exit(130)**. `process.exit` só em: shutdown.ts (0, comando admin), config/bootServices/multiPlatform:111 (1, reject de init), e arquivos legados não usados (whatsappSingleton/standalone/whatsapp.ts).
- **WhatsAppAdapter.disconnected** (linha 85) só loga + chama disconnectedHandler. Não mata processo.
- **Error log recorrente**: `ProtocolError: Protocol error (Runtime.callFunctionOn): Execution context was destroyed` + stack em `puppeteer-core/.../ExecutionContext.ts`, `CdpPage.evaluate`, `CdpFrame.goto` → **Chromium do WhatsApp Web crashando durante inicialização/navegação**.
- **Kernel OOM**: `dmesg`/`/var/log/syslog` sem acesso (precisa sudo) — não confirmado, mas heap baixo descarta OOM de Node.
- **Reinícios em rajada no log** (13463,13542,13588,13631,13677,63834,63885,63950) precedidos por QR Code ASCII (desconexão) ou `shutdown gracioso`.

### Cronologia (sessão atual, linhas ~63834-63950)
```
63834 🚀 Inicializando Bot-WPP          (reinício A)
      [WhatsApp] ✅ Pronto como WarriorBlack
63885 🚀 Inicializando Bot-WPP          (reinício B)
      [WhatsApp] ✅ Pronto como WarriorBlack
63936 [WhatsAppAdapter] Mensagem recebida ...@lid   (seu $menu)
63937 [AutoMod] ENTRY
63939 [AutoMod] botPart: false
63940 🚀 Inicializando Bot-WPP          (reinício C — processo morreu aqui)
```

### Conclusão da causa
**Instabilidade do WhatsApp Web (Chromium/Puppeteer do whatsapp-web.js crashando — `Execution context was destroyed`/`ProtocolError`)** deixa o Client quebrado; o processo Node morre ou é reiniciado (SIGINT), gerando loop de reinícios. O `$menu` é consumido pelo listener mas o processo reinicia antes de `handleIncomingMessage`/`executeCommand`.
- Gatilho exato do SIGINT (pm2 automático por morte do Node vs restart manual) **NÃO confirmado** (não há stack de uncaughtException nas linhas do $menu; exit 130 é externo).
- OOM de Node **descartado** (heap 41MB). OOM de sistema **não confirmado** (sem acesso a dmesg).

### Fluxo messageHandler (COMPROVADO)
- `PlatformManager.startAll()` (69) → `adapter.initialize()` (80) → **`setupAdapterHandlers(adapter)`** (81).
- `setupAdapterHandlers` (96) → `client.onMessage(async raw => { enrichMessage → detecta $ → handleIncomingMessage })` (99).
- `client.onMessage` = `WhatsAppAdapter.onMessage(handler)` (509) → `this.messageHandler = handler`.
- Definido na inicialização, ANTES de qualquer mensagem. `on('message')` (127) chama `if (this.messageHandler) await this.messageHandler(platformMsg)`.
- **Handler existe e está conectado** — $menu não falha por falta de handler.

### Correção recomendada (proposta, não implementada)
1. Estabilizar WhatsApp Web: tratar `disconnected`/`auth_failure` com reconexão graceful sem matar o Node;考虑 usar `client.initialize()` em retry com backoff; investigar por que o Chromium crasha (versão do WhatsApp Web / puppeteer / `--disable-dev-shm-usage` já presente, mas talvez `--single-process` ou `userAgent` fixo ajude).
2. Garantir que um crash do browser NÃO derrube o processo: isolar o Client em try/catch e reconectar, não deixar uncaughtException matar o bot.
3. Desacoplar AutoMod do caminho crítico (rodar após/paralelo ao despacho do comando).
4. Só testar $menu APÓS estabilizar (não antes).

### Nível de confiança
- Reinícios interrompem o $menu: **ALTO** (comprovado por log).
- Causa = instabilidade do WhatsApp Web/Chromium: **MÉDIO** (error log mostra ProtocolError de browser; mas gatilho exato do SIGINT não confirmado).
- OOM: **BAIXO** (descartado para Node; sistema não confirmado).

---

## ETAPA 2 — QUEM DISPARA O SIGINT / EXIT 130 (2026-08-07, leitura apenas)

### Evidências novas
- **PM2 jlist**: `exit_code: 130`, **`exit_signal: None`**, `restart_time: 4`, `unstable_restarts: 0`, `max_restarts: None`, `min_uptime: None`, `prev_restart_delay: 0`, `kill_retry_time: 100`, `treekill: true`, `autorestart: true`.
  - `exit_signal: None` + `exit_code: 130` ⇒ PM2 viu o processo **sair com código 130**, não morto por sinal detectado. No Node, 130 = SIGINT sem handler efetivo OU `process.exit(130)` explícito. **Nenhum código ativo chama `process.exit(130)`.**
- **Out log**: `🛑 Encerrando bot...` aparece **8 vezes** (linhas 289, 446, 603, 6015, 6187, 10698, 12544, 12770).
  - Esse log vem do handler `process.on('SIGINT'/'SIGTERM')` do `multiPlatform.ts:95-104` que faz `await shutdownAll(); process.exit(0)`.
  - **PROVA de que o processo recebeu SIGINT/SIGTERM e iniciou graceful shutdown ao menos 8x** → reinícios foram por **sinais externos intencionais**, não crash espontâneo.
  - IMPORTANTE: os 8 "Encerrando bot" são de **2026-08-03 a 08-05**. Os reinícios de HOJE (linhas 13463, 63834, 63885, 63940) **NÃO** têm "Encerrando bot" antes ⇒ causa de hoje é separada/inconclusiva.
- **Error log**: `ProtocolError: 6`, `Execution context was destroyed: 1`, `Target closed: 3`, `Page crashed: 0`, **`uncaughtException: 0`**, **`Erro fatal na inicialização (exit 1): 0`**.
  - O catch de `initializePlatforms` (multiPlatform.ts:111, `process.exit(1)`) **nunca disparou** (0 ocorrências). Não há uncaughtException.
  - ⇒ Os `ProtocolError` do Chromium **NÃO matam o processo** (são capturados na inicialização/reconexão). Chromium instável é **sintoma**, não causa do restart.
- **Código ativo que encerra**: `multiPlatform.ts:111` `process.exit(1)` (init reject — 0 ocorrências no log), `shutdown.ts:26` `process.exit(0)` (comando `$shutdown` admin), `multiPlatform.ts:95-104` SIGINT/SIGTERM → `process.exit(0)`. Nenhum `process.exit(130)`.
- **linux_maintenance.sh** (linhas 64-68): faz `pm2 delete bot-wpp` + `pm2 start ecosystem.config.js` — envia SIGINT ao processo antigo. É o caminho de deploy/manutenção.
- **Cron**: apenas `30 3 * * * find .../backup -mtime +15 -delete` (limpeza). **Nenhum cron/systemd timer faz pm2 restart** (list-timers não tem bot-wpp; busca em /etc/cron* e /var/spool/cron não achou referência a linux_maintenance/pm2 restart).
- **journalctl / syslog / dmesg / OOM kernel**: **INCONCLUSIVO** — `sudo journalctl` exige senha interativa (não disponível via SSH não-interativo); syslog/dmesg sem saída acessível. OOM de sistema não confirmado nem descartado.

### Cronologia de 3 reinícios (comprováveis)
| Horário (INFO) | Reinício (linha) | Último evento antes da morte | Exit/Sinal | Quem iniciou | Evidência |
|---|---|---|---|---|---|
| 2026-08-03 14:05:16 | 6023 | `whatsapp → offline: shutdown gracioso` + `Encerrando bot` (6187) | SIGINT tratado → exit 0/130 | `pm2 delete`+`start` (linux_maintenance ou manual) | "Encerrando bot" + handler SIGINT multiPlatform:95 |
| 2026-08-04 16:50:33 | 12552 | `whatsapp → offline` + `Encerrando bot` (12544/12770) | SIGINT tratado | `pm2 delete`+`start` | "Encerrando bot" + stack discord (erro à parte) |
| 2026-08-07 ~13:38 (deploy) | 13463 | QR Code ASCII (WhatsApp desconectou) — **SEM "Encerrando bot"** | não confirmado | não confirmado (deploy ou morte do processo) | ausência de "Encerrando bot"; QR indica desconexão |

### Revisão da conclusão anterior
"Instabilidade do WhatsApp Web/Chromium causa os reinícios":
- **NÃO SUSTENTADA** como causa dos reinícios. O Chromium é instável (ProtocolError/Target closed no error log) mas o catch de inicialização o segura (0 uncaughtException, 0 exit 1). O processo só reinicia quando recebe **SIGINT/SIGTERM externo** (comprovado por 8 "Encerrando bot").
- Classificação: **possível** (como fator de instabilidade geral) / **não sustentada** como gatilho do restart.

### Conclusão ETAPA 2
- **Quem dispara o SIGINT (reinícios de 03-05/08)**: `pm2 restart` / `pm2 delete`+`pm2 start` via `linux_maintenance.sh` ou manual — sinais externos intencionais. Comprovado.
- **Por que o PM2 reinicia**: `autorestart: true` + comandos de restart externos. Para os de hoje, possivelmente morte do processo reanimada pelo PM2 (INCONCLUSIVO).
- **Chromium/Puppeteer é causa?**: NÃO — é sintoma de instabilidade do WhatsApp Web; o processo não morre por ele.
- **Exit 130 de hoje**: origem exata INCONCLUSIVA (exit_signal None; sem "Encerrando bot" hoje; pode ser morte do processo ou restart sem log de handler).

### O que falta para fechar 100%
1. Acesso a `journalctl`/`dmesg` (sudo) para confirmar/descartar OOM de sistema ou morte por sinal nativo nos reinícios de hoje.
2. Saber QUEM executou o `pm2 restart`/`linux_maintenance.sh` hoje (você ou automatismo) — nos reinícios de 03-05 está claro que foi SIGINT externo; nos de hoje falta correlacionar.
3. Determinar por que os reinícios de hoje NÃO lograram "Encerrando bot" (processo já morto? SIGKILL do pm2 delete? morte por outra causa?).

### Nível de confiança (etapa 2)
- Reinícios de 03-05/08 foram por SIGINT externo: **ALTO** (8 "Encerrando bot" + handler comprovado).
- Chromium NÃO é a causa dos reinícios: **ALTO** (0 uncaughtException, 0 exit 1, catch segura).
- Causa exata dos reinícios de HOJE: **BAIXO/INCONCLUSIVO** (sem "Encerrando bot", exit_signal None).

## Próximos passos da investigação
1. `pm2 describe 0` / `pm2 jlist` → exit code, sinais, restart reason.
2. Logs PM2 (out/error) → killed/SIGKILL/SIGTERM/OOM/heap/Chromium/Target closed/Protocol error.
3. Kernel/systemd → oom-killer / Killed process.
4. Handlers do WhatsAppAdapter: `disconnected`, `auth_failure`, `change_state`, `qr`, `ready`, `loading_screen` → se algum chama `process.exit()` ou força restart.
5. `ecosystem.config.js` → autorestart, max_memory_restart, max_restarts, watch.
6. Provar via código onde `WhatsAppAdapter.messageHandler` é definido e quem registra (setupAdapterHandlers → client.onMessage).
7. Cronologia de 3 reinícios com timestamps.

## Fluxo do messageHandler (a confirmar em código)
- `PlatformManager.setupAdapterHandlers` (PlatformManager.ts:96) chama `client.onMessage(async raw => { enrichMessage → detecta comando → handleIncomingMessage })`.
- `client.onMessage` = `WhatsAppAdapter.onMessage(handler)` (adapter linha 509) → `this.messageHandler = handler`.
- `WhatsAppAdapter.on('message')` (linha 127) → `if (this.messageHandler) await this.messageHandler(platformMsg)`.
- Isso acontece na inicialização (registerAdapter → setupAdapterHandlers), antes de qualquer mensagem.

## @lid
- `msg.from: 202658048684056@lid`, `msg.author: undefined`, `chat.id._serialized: 202658048684056@lid` (chat do autor, não @g.us de grupo).
- Indica mensagem de chat privado com o bot (ou normalização do whatsapp-web.js).
- Não é a causa do $menu não responder (AutoMod só retorna false com @lid). É informação contextual.

## Correção recomendada (proposta, não implementada ainda)
1. Estabilizar processo: tratar `disconnected`/`auth_failure` com reconexão graceful, não deixar Node morrer.
2. Desacoplar AutoMod do caminho crítico (rodar após/paralelo ao despacho).
3. Confirmar causa do restart antes de qualquer teste de comando.
