# AI_HANDOFF — AutoMod / Cards de Cassino (WhatsApp Web)

> Handoff técnico gerado em 2026-08-19. Registra estado, tentativas e conclusões sobre
> a moderação automática de bots de cassino (cards interativos) no bot-wpp.

## Estado atual

- **Bot online** (PM2 `bot-wpp`, Linux `/home/solanojr/bot-wpp`). WWebJS 1.34.7, Node 20.20.2, Puppeteer 24.x.
- **AutoMod funciona para mensagens NORMAIS** (texto/imagem com body): detecta cassino e **bate + bane** (comprovado: `banned_users` id 9, AutoMod, 2026-08-18).
- **CK7 (28347522375907, Indonésia)** foi **banido** do grupo Figurinhas (log `removeParticipant - SUCESSO`).
- **MI065085 (+62 895-6270-65085)** entrou no Figurinhas via link de convite e postou um **card interativo de cassino** (botão "Conversar com +62..."). O card **NÃO PODE ser apagado via bot** (ver Conclusão).

## Arquivos importantes

- `src/services/autoModService.ts` — `processAutoMod`, `isForeignNumber`, `recordMemberJoin`, `extractTextFromInteractiveMessage`, `SPAM_PATTERNS`.
- `src/platforms/whatsapp/WhatsAppAdapter.ts` — handlers `message`/`message_create`/`group_join`/`group_update`; `handleMemberJoin` (remove banidos + AGORA remove estrangeiros na entrada); `removeParticipant`.
- `src/bot/commands/kick.ts` / `src/bot/commands/index.ts:329` — remoção correta: `chat.removeParticipants([userId])` (ARRAY).
- `src/services/databaseService.ts` — `group_mod` (config por grupo). `normGroup()` remove prefixo `wpp:`/`tg:`/`dc:`.
- `src/devtest/selftest.ts` — testes autônomos (não mexer no grupo Figurinhas no boot).

## Método correto de remoção (WWebJS)

```ts
// GroupChat do WWebJS — RECEBE ARRAY:
await chat.removeParticipants([userId]);   // ✅ correto
// chat.removeParticipant(userId)           // ❌ "is not a function"
```
O adapter já faz isso em `WhatsAppAdapter.removeParticipant(chatId, userId)` → chama o WWebJS internamente.

## Detecção na ENTRADA (SOLUÇÃO DEFINITIVA implementada)

`WhatsAppAdapter.handleMemberJoin` (chamado por `group_join` e `group_update` type 'add'):
1. Remove membros **BANIDOS** (SQLite `banned_users`) automaticamente.
2. **NOVO (2026-08-19):** se `group_mod.antiestrangeiro` estiver ligado, remove na HORA qualquer membro cujo DDI **não seja BR (55)** — antes do bot de cassino postar o card invisível.

Como ligar: `$antiestrangeiro on` no grupo (ou `$automod on`, que liga tudo). O grupo Figurinhas já tem `antiestrangeiro=1` no DB.

## Tentativas realizadas (card do MI065085)

| # | Data | Objetivo | Método | Resultado |
|---|------|----------|--------|-----------|
| 1 | 2026-08-18 | Apagar msg | `msg.delete(true)` (fetchMessages achou a do CK7) | CK7 apagado/banido; MI065085 NÃO aparece no fetchMessages |
| 2 | 2026-08-18 | Apagar msg MI065085 | `client.removeParticipants` | ❌ "is not a function" (sintaxe errada) |
| 3 | 2026-08-18 | Apagar msg MI065085 | `chat.removeParticipant(id)` | ❌ "is not a function" |
| 4 | 2026-08-18 | Apagar msg MI065085 | `client.sendMessage(fig,{delete:{id,fromMe:false}})` | sem id (fetch não retorna a msg) |
| 5 | 2026-08-19 | Apagar msg MI065085 | `pupPage.evaluate` → `Store.SendCommand.sendRevokeMsgs` | store interno: `no-store` (minha busca quebrou em `.replace`); não achou id |
| 6 | 2026-08-19 | Banir MI065085 | `chat.removeParticipants(['895627065085@c.us'])` | ❌ "expected at least 1 children" = ele JÁ NÃO ESTAVA no grupo (já removido) → método em ARRAY funciona |

## Diagnóstico do card (HIPÓTESES do ChatGPT testadas)

- **Evento `message`/`message_create` NÃO dispara** para o card (confirmado: listener ao vivo 40s = 0 capturas).
- **`fetchMessages` NÃO retorna** o card (WA omite payload de card interativo de cassino nos clientes Web).
- **Store interno:** `window.require('WAWebCollections').Msg` existe; métodos atuais são `byChat`, `byThreadId`, `byParentMessage` etc (NÃO `get`/`getMessagesById` antigos). Minha busca `findMsg` quebrou em itens sem `author`/`from` string (`.replace is not a function`), logo **não confirmei se o card existe no MsgStore** — mas como `fetchMessages` e os eventos não o entregam, a conclusão prática é: **o card é inacessível ao WWebJS**.
- **Conclusão:** apagar o card específico via bot é **inviável** (Meta omite o payload). Só o app oficial do celular carrega/apaga (conforme print do dono mostrando "Não foi possível carregar a mensagem" + menu "Apagar").

## Conclusão (respostas do roteiro do ChatGPT)

1. O card é detectável? **NÃO via WWebJS** (evento não dispara, fetch não retorna).
2. O remetente é identificável? **SIM** (pela entrada `group_join` / notification.author).
3. O messageId é recuperável? **NÃO** (não está no runtime acessível).
4. O card existe em algum Store? **Não confirmado** (busca quebrou); praticamente inacessível.
5. É possível apagar o card? **NÃO via bot.**
6. Qual API funciona? `chat.removeParticipants([id])` (remover autor).
7. Qual API não funciona? `msg.delete(true)` no card; `Store.SendCommand.sendRevokeMsgs` (sem id).
8. Por quê? WhatsApp Web omite payload de cards interativos de cassino em clientes não-oficiais.
9. Alteração mínima: **remover estrangeiro na entrada** (`handleMemberJoin` + `antiestrangeiro`). Feito.
10. Arquivos alterados: `WhatsAppAdapter.ts` (handleMemberJoin), `autoModService.ts` (extractText _data), `databaseService.ts` (normGroup), `selftest.ts`.
11. Testes: 97/97 passando.
12. Próximo passo: validar remoção automática de estrangeiro na entrada (pedir à Janny ou dono entrar com conta não-BR, ou conta de teste com DDI estrangeiro).

## O que a próxima IDE precisa saber

- **NÃO tente `msg.delete(true)` no card** — já testado 6x, o card não existe no runtime.
- Para combater esse spam: mantenha `antiestrangeiro` ligado nos grupos. O bot remove o autor na ENTRADA, antes do card.
- O card do MI065085 específico só sai apagando no celular do dono (app oficial).
- Para domínios de cassino novos: adicionar em `SPAM_PATTERNS` (autoModService.ts).
