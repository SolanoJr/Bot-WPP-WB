# BACKLOG — itens conhecidos, não urgentes

## Auditoria de silent bugs (INC-021, 2026-10-24)

Varredura dos 5 padrões (catch vazio, silent gate, sendMessage com objeto,
`?? undefined`, return null/false sem log) em `src/`. 3 críticos corrigidos nos
fluxos principais (deploy da auditoria INC-021); os itens abaixo são edge
cases aceitáveis — best-effort documentado, sem impacto no fluxo principal:

- `bot/commands/deleteMsg.ts:20` — catch vazio na observabilidade de
  laboratório (best-effort por design).
- `platforms/whatsapp/baileys/BaileysMessageNormalizer.ts` (443/496/516/580/
  598/612/635/647) — catches vazios em: parse de `buttonParamsJson` (texto de
  botão é opcional), observação de laboratório, resolução de display_name para
  automod (segue sem nome), validação de URLs. Nenhum interrompe a mensagem.
- `platforms/whatsapp/baileys/BaileysMessageSender.ts:137` — recuperação do
  texto do quoted falha em silêncio; o reply segue SEM preview de texto, mas
  COM o quote (stanzaId intacto — o fluxo de apresentação/feedback usa o
  stanzaId, não o texto).
- `platforms/whatsapp/BaileysAdapter.ts:672` — senderName no automod (igual ao
  normalizer acima).
- `services/autoModEngine.ts` (176/204/238/254/274/327/596) — catches vazios
  em checks opcionais do automod (cache, URLs, anúncios). Ações principais
  logam.

## Mock do gateway Discord (Tarefa 1, 2026-10-24)

Os 3 testes do `DiscordAdapter` estão `it.skip` porque o discord.js tenta login
real com dummy token (10s de timeout cada). Mockar o gateway em rodada própria
quando o canal Discord voltar a ser prioridade — hoje é secundário (produção =
WhatsApp + Telegram).

## Silent bugs audit — fluxos principais (Tarefa 2, 2026-10-26)

Varredura das 5 categorias (catch vazio, `if (!x) return;`, `sendMessage` com
objeto, `?? undefined`, `return false/null` em async) em apresentação, feedback,
welcome e notícias.

**Corrigidos na hora (2):** `feedbackService.isFeedbackEnabledForGroup` e
`welcomeService.isCommunity085Group` — gates `catch { return false; }` sem log;
DB fora deixava todo evento em `policy=0` e a apresentação surda, sem rastro.
Agora `logger.warn` com groupId (mesma forma dos irmãos `isPresentationEnabled`).

**Avaliados e benignos (não mexer):**
- `presentationService.ts:201-202` — guards "não é minha mensagem" rodam para
  toda mensagem de grupo; logar seria spam. Os gates de CONFIGURAÇÃO logam
  com dedupe por grupo (padrão INC-020).
- `presentationPublisher.ts:261-264` — `sendMessage(jid, {image…}, {quoted})`
  é o contrato nativo do Baileys (`sock: any` = WASocket bruto), não a
  PlatformClient. Não é bug de objeto-vs-string.
- `feedbackService.markExpired` (`!eventIds.length`) e lookups que retornam
  null como contrato ("não agrupa", "não tem template") — o caller decide.
- `newsService.curateSet:166` —  rejeição silenciosa do conjunto curado é o
  guard de qualidade desejado (comentário no ponto); se um dia as notícias
  saírem sempre sem curadoria, vale logar o motivo no debug. Edge opcional.

## Melhorar cobertura de testes (INC-026 tarefa C, 2026-10-28)

Report de coverage (@vitest/coverage-v8@3.2.7, `npx vitest run --coverage`).
Focais pedidos — serviços CRÍTICOS DO FLUXO estão todos ≥70%:

| Arquivo | Statements | Situação |
|---|---|---|
| feedbackWorker.ts | 91.42% | ✓ |
| feedbackService.ts | 83.89% | ✓ |
| presentationService.ts | 86.00% | ✓ |
| presentationPublisher.ts | 77.33% | ✓ |
| TelegramAdapter.ts | 53.14% | <70 |
| DiscordAdapter.ts | 20.89% | <70 |
| BaileysAdapter.ts | 23.11% | <70 |

"Melhorar cobertura em" — os 3 adapters. Contexto (não é descuido): os
adapters já têm suítes dedicadas (adapters.test, discordAdapter.test,
baileysReply, feedbackAdaptersLeave — os handlers de leave do INC-024
estão cobertos), mas o ARQUIVO inclui superfície grande de integração
real (login/emparelhamento Baileys, gateway de voz/minecraft/screen do
Discord, presence, polling) que não é unit-testável sem hardware/contas
reais. Alvos de melhoria com melhor custo/benefício, por adapter:

- TelegramAdapter (53%): getChats/getChatMember/reply/editAdmin —
  mockar bot.telegram e cobrir os métodos de moderação; faltam os
  branches de erro do sendMessage (erro de API → false com log).
- DiscordAdapter (21%): sendMessage com reply/attachment/delete (o
  block 288-302), getChats, react, kick/ban via guild.members — tudo
  mockável em client/guild; o handler guildMemberRemove já está coberto
  (INC-024).
- BaileysAdapter (23%): os gates de groupMetadata/prefixos do
  sendMessage, reconnect/restart, e o fluxo de presence. O corpo já é
  coberto parcialmente por baileysReply; os branches de jid (PV vs
  grupo vs broadcast) são o próximo alvo.

Outros <70% fora dos focais (registro, sem prioridade definida):
server.ts 0%, broadcaster.js 0%, reacaoService 7.69%, testServer 16.59%,
listsService 21.73%, rateLimiter 36.11%, infractions 41.86%,
metricsService 53.73%, quizService 51.42%, discordScreenService 35.63%,
retryWithBackoff 63.97%, bomDiaService 69.23% (borderline).
All files: 24.68% (o total pesa superfícies de integração sem unit).
