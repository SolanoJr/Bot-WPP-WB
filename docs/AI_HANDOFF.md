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
| 1 | 2026-08-18 | Apagar msg | `msg.delete(true)` (fetch achou CK7) | CK7 apagado/banido; MI065085 NÃO no fetchMessages |
| 2 | 2026-08-18 | Apagar msg MI065085 | `client.removeParticipants` | ❌ "is not a function" (sintaxe errada) |
| 3 | 2026-08-18 | Apagar msg MI065085 | `chat.removeParticipant(id)` | ❌ "is not a function" |
| 4 | 2026-08-18 | Apagar msg MI065085 | `client.sendMessage(fig,{delete:{id,fromMe:false}})` | sem id (fetch não retorna) |
| 5 | 2026-08-19 | Apagar msg MI065085 | `pupPage.evaluate` → `Store.SendCommand.sendRevokeMsgs` | busca quebrou em `.replace` (NÃO é prova de inacessibilidade) |
| 6 | 2026-08-19 | Banir MI065085 | `chat.removeParticipants(['895627065085@c.us'])` | ❌ "expected at least 1 children" = ele JÁ NÃO ESTAVA no grupo → método em ARRAY funciona |
| 7 | 2026-08-19 | **Localizar card EXISTENTE** (FASE 1) | `Msg.byChat/byThreadId/byParentMessage` com safeStr | `byChat`=2 objs, `byThreadId`=0, `byParentMessage`=0; nenhum é MI065085 |
| 8 | 2026-08-19 | **Localizar card EXISTENTE** (FASE 2) | `Store.Chats.get(chatId).msgs` + listar todas as coleções Msg/interactive/template | Stores: Chat,Msg,MsgInfo,StarredMsg,PinInChat,Newsletter. `Msg.byChat`=2 objs (sem MI065085). `Store.Chats.get(chatId)`=**"chat nao encontrado no Store"**. Sem stores separados de interactive/nativeFlow. |

## Investigação controlada do card EXISTENTE (FASE 1+2 — evidência real)

Executado via `pupPage.evaluate` no store interno do WhatsApp Web, **sem remover ninguém, sem criar msg, sem revogar**:

- **WAWebCollections** existe. Coleções de mensagem: `Chat`, `ChatAssignment`, `WAWebChatPreferenceCollection`, `Msg`, `MsgInfo`, `StarredMsg`, `PinInChat`, `WAWebNewsletterCollection`, `WAWebNewsletterMetadataCollection`.
- **NÃO há store separado** de `interactive`/`nativeFlow`/`template` — fariam parte do `Msg`.
- `Msg.byChat('120363419033272638@g.us')` → **2 objetos** (filtro seguro com `String()` não achou MI065085/`895627065085`/`Conversar com`/14:54).
- `Msg.byThreadId` → 0. `Msg.byParentMessage` → 0.
- `Store.Chats.get('120363419033272638@g.us')` → **"chat nao encontrado no Store"** (o chat do Figurinhas não está carregado no runtime do bot).
- Métodos reais do `Msg`: `byChat`, `byThreadId`, `byParentMessage`, `_editKeyByParentKey`, `_parentKeyByEditKey` — **sem `get`/`getMessagesById`** (nomes antigos não existem mais na versão atual).

## Conclusão (respostas do roteiro do ChatGPT)

1. O card é detectável? **NÃO via WWebJS** (evento não dispara; fetch não retorna; Msg store só tem 2 msgs; Chat store não tem o chat).
2. O remetente é identificável? **SIM** (pela entrada `group_join` / notification.author).
3. O messageId é recuperável? **NÃO** (não está em nenhum Store acessível).
4. O card existe em algum Store? **NÃO nos examinados** (Msg=2 objs sem MI065085; Chat=ausente; sem stores de interactive).
5. É possível apagar o card? **NÃO via bot.**
6. Qual API funciona? `chat.removeParticipants([id])` (remover autor).
7. Qual API não funciona? `msg.delete(true)` no card; `Store.SendCommand.sendRevokeMsgs` (sem id).
8. Por quê? WhatsApp Web omite payload de cards interativos de cassino em clientes não-oficiais; o card não é materializado em nenhum Store acessível ao WWebJS (confirmado por inspeção controlada, não por busca quebrada).
9. Alteração mínima: **remover estrangeiro na entrada** (`handleMemberJoin` + `antiestrangeiro`). Feito.
10. Arquivos alterados: `WhatsAppAdapter.ts` (handleMemberJoin + processAutoMod em message_create), `autoModService.ts` (extractText _data), `databaseService.ts` (normGroup), `selftest.ts`, `docs/AI_HANDOFF.md`.
11. Testes: 97/97 passando.
12. **Conclusão (formulada com precisão técnica, conforme revisão):** Até o momento, o card do MI065085 **não foi localizado** nos mecanismos do WWebJS e Stores internos examinados (Msg.byChat=2 objs sem o MI065085; Store.Chats.get(chatId)="chat nao encontrado no Store"; sem stores separados de interactive/nativeFlow). Portanto **não foi possível obter seu messageId** e realizar uma tentativa efetiva de revogação. Isso NÃO é prova matemática de que não existe nenhuma outra forma — apenas que, pelos caminhos examinados, o objeto da mensagem não está acessível ao bot. A remoção automática na entrada (`handleMemberJoin` + `antiestrangeiro`) segue sendo a solução prática; o card específico só sai apagando no celular (app oficial). **Investigação permanece ABERTA** (não encerrada como "impossível").

## FASE 4 (2026-08-19) — ativar chat + inspecionar Store.Chats

Executado: `client.getChatById(fig)` → `fetchMessages(60)` (activate/open/markRead não existem nesse Chat do WWebJS, não logaram) → `pupPage.evaluate` inspecionando `Store.Chats` e `WAWebCollections.Msg.byChat`.

**Resultado:**
- `storeChatsType: "undefined"` — **`W.Store.Chats` NÃO EXISTE nessa instância do WhatsApp Web**. Correção de interpretação (conforme revisão): não é que "o chat não está no Store"; é que **esse caminho de API (`Store.Chats`) não está exposto nessa versão**. Conclusões anteriores baseadas em "Store.Chats.get não é função" estavam incorretas ao inferir ausência do chat.
- `collMsgByChat: "function"` — `WAWebCollections.Msg.byChat` existe.
- `msgByChat: 101` — após `fetchMessages`, o `Msg.byChat` retornou **101 objetos** (antes eram 2, porque o chat não estava carregado; o fetch carregou o histórico).
- `msgByChatFound: []` — **nenhum dos 101 objetos é o MI065085** (`895627065085` / `Conversar com` / 14:54).

**Conclusão FASE 4 (precisa):** Com o chat carregado (101 msgs no Store), o card do MI065085 **continua ausente** dos objetos materializados pelo WWebJS. Isso é evidência forte de que o card não é entregue ao cliente não-oficial — mas **NÃO é prova matemática de impossibilidade** de revogação por outros mecanismos (ex: history sync, message_revoke_everyone, Cmd.sendRevokeMsgs com id construído). A investigação **permanece aberta**.

O que foi demonstrado: (a) messageId do card não encontrado; (b) Msg.byChat retornou 101 objs mas sem o MI065085; (c) Store.Chats não exposto nessa instância (não conclusão de ausência); (d) não houve tentativa efetiva de revogação (falta o messageId).

## ARQUIVO DE RETOMADA

Pendências e próximos passos do card MI065085 (FASE 5+): ver `docs/CARD_PENDING.md`.
Investigação permanece ABERTA — não declarada "impossível".
