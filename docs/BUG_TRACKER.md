# 🐛 Bug Tracker - WarriorBlack Bot

Este documento registra bugs críticos encontrados e suas respectivas soluções para evitar reincidência.

## Estado atual (2026-09-02)

- **CONFIRMADO / P0:** proteções de dono e bot agora usam comparação exata de telefone/LID em `permissions.ts` e também nos três adapters.
- **CONFIRMADO / P1:** `$mute` usa estado do core, preserva `@lid` e bloqueia dono/bot; há testes unitários de regressão.
- **CONFIRMADO / P1:** healthcheck lê `healthStore` e `PlatformManager.getActivePlatforms()`/`getAdapter()`; processo PM2 online não equivale a WhatsApp conectado.
- **CONFIRMADO / P1:** percentuais de memória usam o limite real do heap V8, não o `heapTotal` elástico de curto prazo.
- **CONFIRMADO / P1:** `npm audit --omit=dev` está sem vulnerabilidades runtime após atualizar transitivas. O npm 10 do Linux ainda reporta 6 vulnerabilidades altas somente em ferramentas de desenvolvimento; não afetam o processo de produção e ficam pendentes de atualização compatível do toolchain.
- **RESOLVIDO / P1:** produção foi reconciliada com `ecosystem.config.js`: cwd, logs estáveis, `--expose-gc` e banco estão corretos.
- **PENDENTE / P2:** suíte local ainda requer binding compatível do `sqlite3` com Node 20 ou uma estratégia de dependência nativa multiplataforma.
- **RESOLVIDO / P2:** com Node `20.20.2` e scripts nativos habilitados, a suíte completa passa `146/146`; Node 24 não é runtime suportado para esta validação.

As entradas abaixo são histórico legado. Referências a WWebJS, Chromium, `src/whatsapp.ts` e `autoModService.ts` não descrevem o engine atual, que é Baileys.

## 1. Comandos Ignorados ($pergunta, $ban)
- **Sintoma**: O bot recebia o comando mas não respondia ou dava erro de "não definido".
- **Causa**: Conflito no `messageHandler.ts` onde a moderação interceptava o comando antes da execução, ou o `dist` estava desalinhado com o `src`.
- **Solução**: 
    - Reordenado o `messageHandler.ts` para que comandos (iniciados com `$`) pulem a moderação.
    - Forçado o uso de `handleKeywords` e `processAutoMod` com importações explícitas no `WhatsAppAdapter.ts`.
    - Atualizado o modelo da IA para `gemini-1.5-flash` para maior estabilidade e cota.

## 2. Gatilho "bot" sem Resposta
- **Sintoma**: Digitar "bot" no chat não gerava a resposta sarcástica.
- **Causa**: O `WhatsAppAdapter.ts` não estava importando ou chamando o `handleKeywords` corretamente após a migração para TypeScript.
- **Solução**: Importado `handleKeywords` no adaptador e adicionado bloco `try/catch` para interceptar a palavra-chave antes de enviar ao processador de comandos.

## 3. Erro no Comando $ban
- **Sintoma**: "client.blockContact is not a function".
- **Causa**: Uso de método inexistente na versão atual do `whatsapp-web.js`.
- **Solução**: Alterado para `contact.block()`, que é o método nativo correto da biblioteca.

## 4. Menu Desatualizado
- **Sintoma**: O menu não mostrava o status do AutoMod mesmo após a atualização.
- **Causa**: O `menu.ts` estava tentando importar de `moderationService` (antigo) em vez de `autoModService` (novo).
- **Solução**: Unificada a fonte de dados para `autoModService.ts` e atualizado o comando `$menu`.

## 5. Screen share na porta do Prometheus (3001)
- **Sintoma**: `discord-screen` e `metricsService` disputando `:3001` — um dos dois morria com `EADDRINUSE` após o deploy.
- **Causa**: Screen herdou a 3001 do `discord-screen-main`; métricas já ocupavam a 3001 (documentado em `MONITORING_GUIDE.md`, scrape ativo em produção).
- **Solução**: Screen movido para **3002** (server, client proxy, scripts, `Dockerfile`, `Caddyfile`, `.env.example`, `ecosystem.config.js`, `$screen`, `DiscordScreenService`); server passou a ler `DISCORD_SCREEN_PORT` / `DISCORD_SCREEN_PUBLIC_ORIGIN` do `.env` (antes hardcoded). Métricas mantêm 3001.
- **Status**: CONFIRMADO e corrigido (2026-09-03, commit `46b4e21`). Produção: screen `{"ok":true}` em `:3002`, métricas saudáveis em `:3001`.

## 6. `sync_and_deploy.sh` rodava o resto do deploy dentro de `discord-screen/`
- **Sintoma**: Deploy "verde" mas `pm2 start ecosystem.config.js` falhava (`File not found`) e o bot ficava fora do ar; o `npm run build` executado era o do pacote screen, não o da raiz.
- **Causa**: `cd discord-screen && npm install ... && cd .. | tee -a ...` — o pipe cria subshell e o `cd ..` se perdia; o shell principal permanecia em `discord-screen/`.
- **Solução**: Linha reescrita com `>> "$LOG_FILE" 2>&1` (sem pipe) + comentário de aviso no script.
- **Status**: CONFIRMADO e corrigido (2026-09-03, commit `4f43901`).

## 7. Catch-all `app.get('*')` quebra no Express 5
- **Sintoma**: 3 suítes (`index`, `index-admin`, `index-ws`) falhavam no import (`path-to-regexp: Missing parameter name at index 1: *`), mascarado por um `server/node_modules` aninhado com Express 4 parcial.
- **Causa**: Workspace hoista Express **5.2.1**; `'*'` não é mais rota válida no `path-to-regexp` v8.
- **Solução**: `app.get('*', ...)` → `app.use(...)` em `discord-screen/server/index.js`; removido o `server/node_modules` aninhado (já é gitignored).
- **Status**: CONFIRMADO e corrigido (2026-09-03) — suite `discord-screen/`: 390 testes, 11 arquivos, tudo verde.

## 8. Processo órfão do screen legado ocupando a porta em produção
- **Sintoma**: Novo `discord-screen` (PM2) morria em loop com "porta já em uso" mesmo após o fix da porta.
- **Causa**: Processo de 01/Set rodando `dist/services/discord-screen/index.js` (código legado deletado), fora do PM2, segurando `:3003` — e o `.env` de produção ainda apontava `DISCORD_SCREEN_PORT=3003`.
- **Solução**: Órfão finalizado, `.env` de produção ajustado para `3002`, sobras do `dist/services/discord-screen/` removidas no servidor.
- **Status**: CONFIRMADO e corrigido (2026-09-03). Pendente: validar fluxo completo via laboratório (`$screen` no grupo Teste).

---
*Mantido por Manus AI - Última atualização: Julho 2026*
