# SELFTEST — Testes autônomos em produção (bot se auto-testa)

Pasta `src/devtest/`. O Hermes (operando como o bot `558581344211@c.us` no Linux)
usa estes arquivos para se auto-testar em produção, mandando comandos reais no
grupo teste e lendo o log estável para confirmar.

## Arquivos
- `selftest.ts` — módulo `runSelfTestMod(adapter, alvoTeste)` que manda os comandos
  da `LISTA` (editar sob demanda) no grupo teste. NUNCA apagar.
- `selftest.log` — log próprio dos testes (append-only, para não se perder no log do bot).
- `SELFTEST.md` — este doc.
- `TESTES_REGISTRADOS.md` — correções feitas nos comandos durante os testes (lab).

## Como ligar (sob demanda)
O `BaileysAdapter.ready` dispara o selftest SÓ se `WPP_AUTOSELFTEST=1`:
```ts
if (process.env.WPP_AUTOSELFTEST === '1') {
  const alvo = process.env.WPP_TEST_GROUP_ID;
  if (alvo) setTimeout(() => runSelfTestMod(this, alvo), 6000);
}
```
No Linux: `WPP_AUTOSELFTEST=1 pm2 start ecosystem.config.js --update-env`.
Para testar 1 comando por vez, editar a `LISTA` em `selftest.ts` (ex: `['$ping']`).

## ERROS QUE REPETIMOS E NÃO PODEM VOLTAR
1. **Menção falsa no kick/ban.** O `$kick`/`$ban` exige MENÇÃO REAL. Mandar
   `sendMessage(chat, '$kick')` sem `mentions` → bot responde "Marque o usuário".
   Sempre passar `{ mentions: [tid] }` com o `tid` CRU do participant.
2. **`.replace('@lid','@c.us')` no tid corrompe a menção.** Usar
   `target.id._serialized` CRU. O WWebJS só cria menção se o id bate com o
   `_serialized` exato do participant.
3. **Apagar o teste depois de funcionar.** NÃO faça isso. O teste é o "kit" do
   Hermes; recriar toda vez gera a mesma luta. Deixe guardado em `src/devtest/`.
4. **Conceito VC vs EU.** "VC" = bot 558581344211 (Hermes opera, marca e responde).
   "EU" (dono) = 5588998314322 (celular real; bot NUNCA manda privado pra ele).
   Quando dono diz "vc testa", é Hermes como o bot marcando alvo e mandando $kick.
5. **Causa raiz de "tudo quebrado" (erro interno em todo comando):** o
   `PlatformManager.executeCommand` chamava `command.execute(ctx)` mas comandos
   ANTIGOS usam `execute(msg, client, args)`. Corrigido para
   `command.execute(ctx, adapter.client, message.args ?? [])`. Se voltar a dar
   "erro interno" em todos os comandos, revisar essa chamada primeiro.
6. **`@lid` não cita.** O `sendMessage` filtra `quotedMessageId` se for `@lid`
   (WWebJS moderno lança ao citar @lid). Não remover esse filtro.
7. **Log estável:** sempre `~/.pm2/logs/bot-wpp-stable.out.log` no Linux. O
   `selftest.log` aqui é complemento, não substitui.
8. **`platformMsg` usa `text`, NÃO `body`.** O `BaileysAdapter.dispatchMessage`
   criava `platformMsg.body` → comandos não rodavam (isCommand=false). Corrigido
   para `text: body`. O `PlatformMessage` (PlatformTypes.ts) espera `text`.
9. **`messageStubParameters: []` é truthy.** Filtrar stub com
   `Array.isArray(...) && .length > 0`, NUNCA só `if (msg.messageStubParameters)`.
10. **`getDb()` abria conexão SQLite NOVA toda vez** → lock/competição e ~1min de
    demora em comandos que usam DB (ex: `$pergunta`). Corrigido pra SINGLETON
    (reusa a mesma conexão em `databaseService.ts`).
11. **`createCommandContext` chamava `getChat` (groupMetadata) em TODOS os comandos**
    → o `groupMetadata` vai no servidor WA que pode demorar/travar. Corrigido pra
    LAZY (só busca `groupName`/`isAdmin` quando o comando acessa). Comandos que não
    usam (ex: `$ping`, `$pergunta`, `$clima`) não esperam mais.
12. **`$ping` media 0ms sempre.** Causa: media `Date.now() - Date.now()` (loopback).
    Corrigido pra medir RTT real: `ctx.timestamp` (chegada da msg) → envio.
    O `ctx.timestamp` vem de `message.timestamp` (Baileys, em SEGUNDOS) → multiplicar
    por 1000 pra ms. SEM esse *1000, o RTT dava ~1.7 bilhão de ms.
13. **`msg.reply` inexistente em comandos.** `$pergunta` e `$clima` usavam
    `msg.reply` (undefined) → `TypeError: msg.reply is not a function`. Corrigido
    pra `ctx.reply` (o CommandContext tem `reply`).

## Validação esperada no log estável
- `$ping` → `🏓 *Pong!* (RTT: <ms>ms)` (RTT real, não 0ms)
- `$pergunta <pergunta>` → resposta da IA (ex: "Paris" para capital da França)
- `$clima <cidade>` → `☀️ **CLIMA EM <CIDADE>**` (precisa passar a cidade!)
