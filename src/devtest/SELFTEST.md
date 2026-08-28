# SELFTEST — Testes autônomos em produção (bot se auto-testa)

Pasta `src/devtest/`. O Hermes (operando como o bot `558581344211@c.us` no Linux)
usa estes arquivos para se auto-testar em produção, mandando comandos reais no
grupo teste e lendo o log estável para confirmar.

## Arquivos
- `selftest.ts` — módulo `runSelfTests(adapter, alvoTeste)` que manda `$kick`, `$ban`
  (marcando alvo não-admin válido) e `$clima` no grupo teste. NUNCA apagar.
- `selftest.log` — log próprio dos testes (append-only, para não se perder no log do bot).
- `SELFTEST.md` — este doc.

## Como ligar
No `WhatsAppAdapter.ready`, após a msg de prova, chamar:
```ts
if (alvoTeste) setTimeout(() => runSelfTests(this, alvoTeste), 6000);
```
(não precisa de env extra; roda só quando WPP_TEST_GROUP_ID está definido).

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

## Validação esperada no log estável
- `$kick` marcando alvo → `✅ @<numero> foi removido do grupo (Teste).`
  (o @numero + mentions faz o WA renderizar o NOME, igual ao welcome do novato)
- `$ban` marcando alvo → `✅ @<numero> foi banido do grupo (Teste).`
- `$clima fortaleza` → `☀️ **CLIMA EM FORTALEZA**` (sem "erro interno")
