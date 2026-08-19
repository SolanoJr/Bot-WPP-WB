# CARD MI065085 — PENDÊNCIAS DE RETOMADA (investigação em aberto)

> Estado salvo em 2026-08-19. Retomar de onde paramos. Não declaramos "impossível" —
> apenas que o card não foi localizado nos mecanismos examinados.

## Alvo
- Grupo Figurinhas: `120363419033272638@g.us`
- Remetente: MI065085 / `+62 895-6270-65085` (indonésio, entrou por link)
- Mensagem: card interativo de cassino ("Não foi possível carregar a mensagem" + botão "Conversar com +62...")
- Horário original: 14:54 (ainda visível no celular do dono; app oficial permite apagar manualmente)
- Objetivo: localizar a mensagem EXISTENTE e descobrir se o bot consegue revogá-la.

## O que JÁ foi testado (e resultado)

| Fase | Data | Método | Resultado |
|------|------|--------|-----------|
| - | 18/08 | `msg.delete(true)` em fetch | CK7 apagado/banido; MI065085 NÃO no fetchMessages |
| - | 18/08 | `client.removeParticipants` / `chat.removeParticipant(id)` | ❌ "is not a function" (sintaxe errada; certo é array) |
| - | 18/08 | `client.sendMessage(fig,{delete:{id,fromMe:false}})` | sem id (fetch não retorna) |
| F1 | 19/08 | `Msg.byChat/byThreadId/byParentMessage` (safeStr) | byChat=2 objs, 0/0; nenhum é MI065085 |
| F2 | 19/08 | `Store.Chats.get(chatId).msgs` + listar coleções | Chats.get="chat nao encontrado"; Msg=2 objs sem MI |
| F3 | 19/08 | re-examinar após "carregar chat" | Store.Chats.get="no-Chats.get" (não função) |
| F4 | 19/08 | `getChatById`+`fetchMessages(60)`→inspecionar Store | **Store.Chats inexistente nessa instância**; Msg.byChat=**101 objs** (carregou histórico) mas **0 = MI065085** |

## Conclusão atual (precisa, não "impossível")
- messageId do card **não encontrado** por nenhum caminho examinado.
- `Store.Chats` **não está exposto** nessa instância do WA Web (não inferir "chat ausente").
- Com chat carregado (101 msgs no Store), o card **continua ausente** dos objetos materializados.
- **Não houve tentativa efetiva de revogação** — falta o messageId.
- Hipótese forte: WA omite payload de card interativo de cassino em clientes não-oficiais.
- Solução prática já entregue: `handleMemberJoin` + `antiestrangeiro` remove bot estrangeiro NA ENTRADA (antes do card).

## O que AINDA falta testar (FASE 5+ — não feito)

1. **Evento ao vivo:** o card chega via `message`/`message_create`/`message_ciphertext` quando uma NOVA mensagem desse tipo é postada? (Só testável quando um bot de cassino postar de novo — então o listener ao vivo captura e tenta revogar.)
2. **`Cmd.sendRevokeMsgs` com messageId CONSTRUÍDO** a partir de (chatId + participant `895627065085@lid` + timestamp 14:54). Risco: id exato do WA tem formato `false_<chat>_<epoch>_<sender>` e pode não bater. Testar SOMENTE após confirmar formato via outro messageId conhecido.
3. **History sync / chatstate:** inspecionar se o card entra pelo mecanismo de sincronia de histórico (não pelos eventos normais).
4. **Outra instância do WA Web:** testar numa conta onde o chat esteja "aberto" no cliente (não apenas no runtime do bot) — talvez o card materialize se o chat estiver ativo na UI.

## Como retomar
1. Ler `docs/AI_HANDOFF.md` (FASES 1-4 completas + tentativas).
2. No `src/devtest/selftest.ts`, bloco `ck7-fase4` (ativa chat + inspeciona Store). Estender para FASE 5.
3. Log do Linux: `grep 'ck7-fase4' /home/solanojr/.pm2/logs/bot-wpp-stable.out.log`.
4. Para testar evento ao vivo: manter listener em `message`/`message_create`/`message_ciphertext` por N minutos e pedir à Janny ou dono para um bot de cassino postar (ou esperar espontâneo).
5. NÃO remover ninguém, NÃO criar usuário de teste, NÃO revogar sem confirmar o messageId.

## Proteção MASTER/BOT (feito, falta TESTAR na prática)
- `isProtectedTarget()` em `src/services/permissions.ts` protege: dono (88998314322 / @lid 202658048684056), bot (558581344211), LID interno (2592935567439).
- Aplicado em `$kick` (kick.ts), `$ban` (ban.ts), `$mute` (mute.ts): qualquer um que marque o MASTER/bot recebe `🛡️ Você não pode remover o dono (MASTER) ou o próprio bot.` e NÃO executa.
- **FALTA TESTAR:** mandar `$kick @88998314322` ou `$ban @558581344211` ou `$mute @88998314322` num grupo e confirmar a mensagem de proteção (sem remover ninguém). Não testado ainda por decisão do dono.
- Também validar que comandos de ADM de OUTROS (ex: um admin do grupo) também não conseguem aplicar ação negativa no MASTER/bot.
