BUGS — Incidentes e aprendizados (laboratorio/)
Registro para incidentes não se repetirem (ou, se repetirem, serem
resolvidos rápido). Toda entrada: sintoma → causa raiz → fix (commit) →
como detectar rápido → prevenção.

INC-001 — Notícias E2E: 404 model_not_found nos dois providers (2026-10-17)
Sintoma: no grupo teste, $noticias tecnologia 3 → "⚠️ Ocorreu um erro
interno". Log: "Todos os providers falharam: groq: 404 | gemini: 404".

Causa raiz: modelos descontinuados — Groq não serve mais
llama-3.3-70b-versatile; Gemini não serve mais gemini-2.5-flash para
contas novas.

Fix: b094b42 (NEWS_PROVIDERS → qwen/qwen3.8-27b + gemini-3.8-flash).

Detecção rápida: cd ~/bot-wpp && node laboratorio/probe-ai-providers.js
(segundos, sem deploy).

Prevenção: RULES.md Regra 5 (pirâmide) — probe antes de E2E; modelos
mudam em um único lugar (NEWS_PROVIDERS) e o probe avisa.

INC-002 — askAI/$pergunta no Gemini 2.5 descontinuado (RESOLVIDO em 4dae5af, 19/10)
Sintoma esperado: $pergunta respondendo erro em produção (mesma
depreciação "new users").

Causa raiz: aiService.askAI usava endpoint nativo do Gemini com
gemini-2.5-flash — descontinuado para contas novas (404).

Resolução em DOIS passos:
1. 9bb6ba7 (17/10): gemini-3.8-flash no endpoint nativo + thinkingBudget 0
   (3.x é reasoning-first: sem budget, o thinking come o maxOutputTokens e
   devolve parts:[] com HTTP 200) + parser tolerante. Evidência:
   laboratorio/probe-gemini-native.js.
2. 4dae5af (19/10): unificação no padrão INC-001 — askAI sai do endpoint
   nativo e vai ao pipeline chat/completions ASKAI_PROVIDERS (Groq
   qwen3.8-27b primário → gemini-3.8-flash compat fallback). Probe em prod
   com keys reais: Groq 567ms vs Gemini-compat 19.791ms
   (probe-askai-migration.js). Breaker POR PROVIDER ('askai-groq'/
   'askai-gemini', timeout 30s, 4xx-não-429 não conta); retryApiCall
   interno removido — o fallback entre providers é o retry. Memória
   ai_history best-effort: banco fora → segue sem contexto (logWarning),
   padrão do dedup de notícias. Breaker 'gemini-api' extinto com o nativo.
   Suite: tests/unit/aiServiceAskAI.test.ts (8 casos, breaker mockado por
   persistir estado entre casos no vitest).
   Addendums do E2E: 22b95b0 (log de provider+latência no sucesso) e
   e02bf49 (max_tokens 800 — o E2E ao vivo pegou 429 real do Groq free:
   "OTPM: Limit 1000, Requested 1024"; 1024 nunca passaria, 800 = padrão
   news). E2E final: groq 457ms primário; fallback gemini 4201ms provado
   na mesma noite.

Lição: memory e docs diziam "2.5 ABERTO" quando o fix 9bb6ba7 já estava em
prod — premissa de bug desatualizada quase gerou fix duplicado. Verificar
git log do arquivo ANTES de registrar sintoma de incidente.

INC-003 — Hermes: modelos EOL no NIM e :free extinto no OpenRouter (2026-10-17)
Sintoma: probe laboratorio/probe-hermes-models.js — NIM 410 Gone (EOL):
openai/gpt-oss-120b (2026-09-03), meta/llama-3.3-70b-instruct e
nvidia/llama-3.3-nemotron-super-49b-v1 (2026-08-26); 404: z-ai/glm-5-3
(grafia com underscore não existe) e qwen/qwen3.8-27b:free (só existe a
versão paga no OR); 403: thinkingmachines/inkling-small:free (gated para
"agentic harnesses"); moonshotai/kimi-k3 fora do catálogo NIM — e era a
entrada #1 da chain antiga.

Causa raiz: EOL em massa no NIM + OpenRouter extinguindo :free de modelos
populares. A chain de fallback acumulou 4+ entradas mortas em silêncio —
o Hermes só as usa QUANDO o primário cai, então ninguém nota até o dia ruim.

Fix: rerank da config do Hermes via probe (Regra 5): default
z-ai/glm-5.3@nvidia; fallbacks laguna-s-2.1:free → nemotron-3-ultra:free
→ longcat-2.5-preview:free → cloudflare llama-3.3-70b-fp8 (api_key inline
removida; auth via CLOUDFLARE_API_TOKEN no .env). Backup:
config.yaml.pre-model-rerank. Fallback exercitado 1x com -m inválido +
--usage-file: respondeu via laguna:free, custo $0.

Detecção rápida: node laboratorio/probe-hermes-models.js (LOCAL — keys do
hermes/.env, não do VPS) + hermes fallback list.

Prevenção: Regra 5 antes de qualquer troca de modelo/provider; probe
versionado no laboratorio/; revisar a chain quando o NIM avisar EOL (410
com data).

INC-004 — Kick/ban: mensagem de "plataforma sem lista" quando o metadata
do grupo falha transitoriamente (2026-10-17)
Sintoma: usuário (Alberto) rodou $kick e recebeu "não está disponível
nesta plataforma" com WhatsApp operando; ~5s entre "Executando" e a
resposta; log com "timed out waiting for message" em rajada (socket
degradado).

Causa raiz: adapterProvidesParticipants (groupAdmin.ts:157) checa DADOS
(Array.isArray && length>0), não adapter — quando o groupMetadata falha
ou estoura o race de 5s (BaileysChatManager:56-65), chega participants:[]
+ isPermissionsVerified:false e o comando não distingue disso de
"plataforma sem lista" (TG/DC). O campo existia desde sempre
(PlatformTypes.ts:43 — o comentário já previa este uso exato) e nunca
havia sido consumido.

Fix: 5b7dcfd — kick.ts e ban.ts passam a checar
chat.isPermissionsVerified === false PRIMEIRO e pedem retry curto
("⏳ Não consegui carregar a lista de membros agora. Tente novamente em
alguns segundos."); resto do fluxo intocado. Deploy canary+prod
2026-10-17, backup /tmp/bw-1792279275.

Detecção rápida: grep no log de reply por "não está disponível nesta
plataforma" em contexto WA (não-TG/DC) — após o fix, WA só mostra isso
com o campo ausente/true; e o campo isPermissionsVerified no chat de
teste.

Prevenção: 4 unit tests novos cobrem os 2 ramos por comando
(groupAdminKickBan.test.ts, INC-004 a/b); TG/DC cobertos pela regressão
"REGRESSÃO: TG/DC já recusavam ANTES do fix".

Edge case conhecido: WA + metadata OK + participants=[] cai em "não está
disponível nesta plataforma" (degenerado — irreal na prática: grupo tem
≥1 membro; comportamento prescrito no runbook da rodada).

INC-005 — Discord screenshare: reconexão mobile + freeze web (RESOLVIDO
parcialmente, 2026-10-18; fix 58d8f80)
Sintoma: Janny (mobile) reconecta em ciclo (101 "assistindo"/96 "parou de
assistir" num dia, saídas code=1001); tela desconecta e pede reconexão
manual, webcam (High@L3.0) reconecta sozinha. Cauá (web) freeze de imagem
com áudio fluindo; resolução menor alivia. App de PC do Discord: tela
preta infinita.
Causa raiz: encoder H.264 High profile em 1080p60 → nível L4.2
(avc1.64002a), que decoder de hardware de celular não decodifica — pune
o viewer mobile. High-first em PERFIS_H264; 60fps selecionável na UI e
persistido em localStorage empurra 1080p ao nível 4.2 (maxMBPS).
Evidência: log 17-18/10 (codec=avc1.64002a/640028/64001e), 101 ciclos da
Janny, DERP relay "sao" no tráfego.
Fix (58d8f80, deploy prod 18/10 15:07): PERFIS_H264 Main primeiro
(4d40, decode HW universal; CABAC mantido); cap condicional por nível em
start() e syncSize(): se nivelH264(w,h,fps) > L4.0 e fps > 30, fps=30
(1080p60→30fps; 720p60 preservado — teste do tremor verde); framerate
incluído no re-spread do syncSize; UI da aba sem a opção 60. Teste novo:
1080p60 pin a 30fps + codec avc1.4d4028 (92/92).
Detecção rápida: grep "codec=avc1" no bot-wpp-out.log — 64002a = aba de
captura com broadcaster.js antigo em MEMÓRIA (fechar e reabrir a aba;
reload da sala não recarrega o script). 4d40* = fix ativo. Contar
"viewer saiu" code=1001 em janela de 5min (baseline Janny 101/dia).
CORREÇÃO DE PREMISSA (funnel): a análise inicial concluiu "origem
tailnet-only" a partir de `tailscale funnel status` = "No serve config".
FALSO — o status como usuário não-root não vê a config do tailscaled
(socket exige root). O unit systemd tailscale-funnel.service está
ativo desde 2026-10-11 com `tailscale funnel --set-path=/ 3002`: DNS
público anycast (199.38.181.54/209.177.145.137 via 1.1.1.1), curl 200
com TLS válido do VPS e de cliente externo, CSP frame-ancestors já
libera discord.com. Origem é PÚBLICA desde 11/10. Consequência: a
hipótese "app de PC tela preta = DNS" está refutada — causa provável é
SDK/iframe/boot (pendência). NÃO rodar `tailscale funnel --bg 3002`:
conflitaria com o path / já servido pelo unit.
Notas operacionais:
- `pm2 restart bot-wpp --update-env` DEVE rodar de dentro de ~/bot-wpp:
  o restart captura o CWD do shell chamador. Rodado do $HOME do ssh
  (18/10 15:01) trocou o cwd do processo → DiscordScreenService resolveu
  discord-screen fora do repo → spawn node ENOENT (child morto). Corrigi
  com restart de ~/bot-wpp (15:07). Sintoma: "Client build not found at
  /home/solanojr/discord-screen/client/dist" + spawn node ENOENT.
- "Starting server on port" vazio no log é ruído pré-existente
  (desde 16/10), não sintoma.
- Aba de captura: fechar e REABRIR após deploy do broadcaster.js
  (script em memória). Recarregar a room não recarrega a aba de captura.
Fix parte 2 (2026-10-18, 9c2b06b + cd9fec1, deploy 16:15, restart #6):
- visibilitychange: retry pendente guardado (pendenteRetry) e antecipado
  ao voltar do background — mobile não espera mais o backoff inteiro.
  Cancelamento do pendente no open (não abre 2 sockets). main.js não tem
  harness de teste (boot roda no import; extração testável = refactor de
  rodada própria) — cobertura por revisão + smoke.
- Heartbeat 15s→30s: tick extraído em tickHeartbeat() (exportada para o
  teste) com contador de misses — terminate só no 2º miss seguido; pong
  zera. 3 testes unitários (heartbeat.test.js) sem esperar 15s reais.
- isConfigSupported no player: sonda assíncrona fire-and-forget APÓS o
  configure — contrato síncrono de start preservado (as 3 guardas
  `if (!s.player.start(...))` quebrariam com Promise sempre-truthy);
  suporte negado → onError("não suportado por este dispositivo") +
  stop() em vez de engasgo mudo. 2 testes no player.test.js (403/403).
- NÃO aplicado — boot error UI (F2.2 do runbook): o boot JÁ tem UI de
  erro honesta em 2 níveis (boot().catch → setEmpty('Não foi possível
  entrar', err.message) em main.js:1246 + try/catch do authDiscord
  :1270-1281 + vigia de 8s). Se o sdk.ready falhasse, a tela mostraria o
  motivo. Tela preta infinita do app de PC ⇒ o iframe nem chega a rodar
  o main.js (rede/CSP/bloqueio do client) — o catch proposto seria
  código morto. Diagnóstico: devtools na Activity do desktop.
Pendências restantes (próximas rodadas):
- Render watchdog (client→server "rendered" a cada 2s; >4s sem →
  requestKeyframe) — freeze do Cauá com bufferedAmount saudável.
- App de PC tela preta: causa é pré-JS (iframe não carrega o main.js) —
  abrir devtools na Activity do desktop (Ctrl+Shift+I), conferir erro
  de console/rede antes de qualquer fix de UI.

INC-006 — DEDUP DE NOTÍCIAS (RESOLVIDO 92ebb78, 18/10)
Sintoma: $noticias repetia títulos entre chamadas.
Causa raiz: ausência de histórico; o LLM reemite temas recentes.
Evidência: probe F1 (laboratorio/probe-news-dedup.js) — sem filtro, o
  Groq devolveu o título fictício EXATO; com filtro, 3/3 temas sem
  overlap.
Fix: news_history (tabela + índice) + buildNewsPrompt(topic, count,
  recentTitles) com bloco "NUNCA repita"; extractTitles sem fallback
  (regex sem match → [], dedup falha em silêncio, nunca filtra lixo)
  com strip de markdown em 2 fases; gravação dentro de fetchNews —
  cobre comando manual E scheduler, os 2 caminhos passam por lá (F0.6);
  Set dedup intra-envio; cleanup de 7 dias via cleanupService (cutoff
  computado em JS: datetime('now') do SQLite formata com espaço e não
  compara com o "T" do sent_at); falha de banco degrada com logWarning,
  nunca derruba a notícia.
Smoke prod: 2x "$noticias tecnologia 3" consecutivos → 6 títulos
  distintos (0 overlap); news_history com 6 rows (3+3).
Detecção rápida: rodar 2x seguidas, comparar títulos (0 overlap = OK);
  news_history cresce N por envio.
Limitações conhecidas:
- dedup por string: reformulação semântica ("Apple lança iPhone 17" vs
  "Novo iPhone 17 da Apple") passa. Embedding é rodada própria.
- título = primeiro segmento antes do separador; a descrição fica fora
  do histórico (em-dash interno corta no primeiro).

INC-007 — "3 NOTÍCIAS EM VEZ DE 5" (NÃO É BUG, 18/10)
Sintoma: "projeto continua com as 3 notícias mesmo eu pedindo 5".
Diagnóstico: o smoke da INC-006 (19:08/19:09) injetou $noticias
  tecnologia 3 — N explícito no comando. Nenhum caminho do código
  produz 3 sem o comando pedir 3.
Evidência:
- Código: DEFAULT_ITEMS=5 (noticias.ts:18), MAX_ITEMS=10
  (newsService.ts:29); parser usa DEFAULT_ITEMS quando N não vem;
  buildNewsPrompt interpola ${count}, sem hardcode; schema
  group_news.item_count DEFAULT 5.
- Banco prod: item_count=5 (único grupo, topic=tecnologia, 00:01);
  scheduler passa row.itemCount — o 5 do banco.
- Runtime (inject sem N): $noticias tecnologia → "TOP 5 NOTÍCIAS"
  no log (19:21); news_history 6→11 rows (+5 títulos).
Fix: nenhum.
Detecção de "bug aparente" no futuro: antes de reportar "retorna N
errado", verificar o comando injetado (tem N explícito?) e o
item_count do grupo (SELECT em group_news) — os 2 únicos pontos que
controlam o count.
Lição: log com "TOP 3" numa janela de smoke ≠ comportamento padrão;
a evidência de runtime (inject sem N) prova o default.

INC-009 — Notícias no Geek + meta de grupos persistida (RESOLVIDO 99028c6, 19/10)
Pedido: ativar $noticias no "grupo geek" e persistir nome/descrição de
  grupo (group_mod/group_news só têm JID — sem nome, grupos ficam
  anônimos em rodadas futuras).
Discovery:
- "Geek" = 120363419241913965@g.us ("Geek Fortal 085" em community_groups);
  ≠ Figurinhas (120363419033272638@g.us, antibot=1 audit_only=0).
- community_groups JÁ existia com group_name (welcomeService) — sem
  schema novo: só coluna `description` via addColumnIfMissing, chamada
  APÓS o CREATE da tabela (migrations de :161 rodam antes dela existir).
Evidência:
- DB prod: group_news Geek enabled=1, schedule 08:00, 'mundo geek',
  item_count=5, last_sent_at=2026-10-18T21:27:41 → bloqueia disparo no
  mesmo dia; primeira execução 19/10 08:00. Figurinhas sem linha em
  group_news (nada a desativar).
- 22/10 extensão: Polemic (wpp:120363419784760390@g.us) ativado —
  enabled=1, 08:00, 'política', 5 itens. Teste de tema no LAB com
  sender master: 5 reais (G1/Folha/Agência Brasil/Xinhua), 4/5 eleições
  e governo, news_history com link+pub_date. Fallback fora do
  TOPIC_QUERIES se sustentou — nenhuma query custom necessária.
- Gates: groupsMeta 6/6; tsc exit 0; npm test 779/3 (mesmos 3 flaky
  crônicos de adapters.test.ts, confirmados isolados).
- Deploy 99028c6 (backup → stop → reset → build exit 0 → start ~/bot-wpp):
  "Todas as plataformas prontas", /lab/adapter 200, log
  "migração: community_groups.description adicionada".
- População: POST /lab/groups → 9 grupos; dump community_groups com
  TODOS os nomes ("Geek Fortal 085", "Figurinhas/Stickers", "Polemic",
  "Uber", "Teste"...); description NULL em todos (getChat do Baileys
  não expõe descrição — esperado, documentado, upsert preserva).
Fix: accessors em databaseService (upsertGroupMeta — UPDATE-primeiro
  preserva community_id do welcomeService; INSERT novo usa community_id=''
  corrigido depois pelo welcome; getGroupMeta; listGroups;
  listKnownGroupJids com UNION de 4 tabelas + strip 'wpp:' + dedup);
  população on-demand no /lab/groups e refreshGroupMetas() no runCleanup
  (boot + 6h, best-effort, stat groupsRefreshed).
Nota de bug latente (pré-existente, exposto por esta feature): o boot
  chama startPeriodicCleanup 2x (multiPlatform inicializa 2x —
  "Limpeza periódica agendada" aparece 2x em TODO boot histórico;
  MemoryMonitor "Já está rodando" idem). Antes invisível (cleanup <2s);
  com refreshGroupMetas (~3s) o 2º runCleanup bate no guard isRunning →
  throw capturado → "[ERROR] Erro na limpeza inicial". A limpeza #1
  conclui normal — guard funcionando, benigno, zero impacto. Fix em
  rodada própria: idempotência no startPeriodicCleanup (backlog).
Lição: addColumnIfMissing numa tabela criada DEPOIS no mesmo initDatabase
  deve ficar após o CREATE — senão "no such table" e o helper engole o
  erro: a coluna nunca nasce e o INSERT do accessor quebraria depois.

INC-008 — Antibot v1: score somatório + combo de kick (RESOLVIDO be3cb2a, 19/10)
Antes: `botSignals.length >= 2` → ban+remove+delete+announce (all-or-nothing,
  expulsava estrangeiro legítimo com 2 sinais fracos, ex. foreign+nome-vazio).
Agora: `somaPesos()` (estrutura-bot 5 · link-suspeito 4 · spam-keyword 3 ·
  repetição <60s 3 · nome-suspeito 2 · foreign 2) com thresholds graduados:
  <6 nada · 6-7 delete+infraction · 8-9 delete+announce · >=10 delete+evidência
  admin. Ban/remove SÓ no combo: estrutura-bot + foreign + primeira mensagem
  pós-join (`recentJoinTracker`, janela 60s, consumo único). Ordem do combo:
  delete primeiro; delete não confirmado → NÃO bane (gate do Ajuste 1).
Smoke em prod (lab): score 9 → delete+announce; score 7 → delete+infraction;
  combo → delete PASS + ban ('banido-antibot-card-foreign-first') + remove +
  announce; 2ª msg pós-consumo → threshold, não combo. Kick NUNCA fora do combo.
Gates: 801 tests (798 pass, 3 flaky crônicos de adapters), tsc limpo.
Lições: (1) group_mod usa chave CRUA ('120363...@g.us', sem prefixo 'wpp:')
  — linha com prefixo não é lida pelo evaluate (config fantasma); UPSERT manual
  tem que usar a chave crua. (2) pushName vazio conta como nome-suspeito
  (legado) — em smoke, sempre passar pushName limpo para isolar o score.
  (3) testServer escuta 127.0.0.1 (hardcoded) — perna de verificação do lab
  é sempre curl INTERNO via ssh; externo dá 000 por design.

APRENDIZADOS
Injeção via /lab/inject-message deve respeitar o contrato do comando:
$noticias <tema> [N] — $noticias 3 tecnologia vira tema
"3 tecnologia" (o parser só aceita N como ÚLTIMO argumento). O 1º E2E
falhou por isso, não por código.

Prova de conectividade nunca se faz com mock de axios; mock prova lógica
de fallback.

Push desta máquina Windows não tem credencial GitHub — caminho usado:
git bundle → scp → VPS (credencial armazenada em ~/.git-credentials) →
git push origin FETCH_HEAD:refs/heads/main.

INC-010 — WELCOME NÃO TAGGEIA O NOVATO (RESOLVIDO em 04952b4, 19/10)
Sintoma: o bem-vindo nunca marcou ninguém — 3 defeitos EMPILHADOS:
(1) texto sem handle: DEFAULT_WELCOME tem "@novato" literal e {numero}
renderiza só dígitos; o WhatsApp exige handle no TEXTO e JID no array.
(2) lambda do ctx no adapter com aridade 2 descartava o 3º param
mentions. (3) BaileysMessageSender nunca montava mentions no content
(protocolo: { text, mentions: [jid] } no 2º arg) — corolário: os avisos
de $ban/$kick, que já passavam options.mentions, também nunca
renderizaram (fix na classe consertou os três de uma vez).
Fix F3 (f70153b): {handle} no render + fallback @novato→handle (customs
legados preservados), aridade 3 na lambda, msgOpts.mentions no sender.
Fix F4 (04952b4): grupos LID entregam o participant como @lid e o
cliente SÓ renderiza mentions PN — resolvePn (ctx opcional) converte
@lid→@s.whatsapp.net via getChat().participants ANTES do handle/mentions;
kick/tracker/ban ficam com o JID original (não regredir INC-008).
Probe (Regra 5, /lab/probe-mentions, 3 cenários): A (handle PN +
mentions PN) ✅ · B (PN + LID) ✗ · C (LID + LID) ✗ — só PN+PN renderiza
em grupo LID. onWhatsApp não expõe LID de toda conta (fallback via
participants resolveu).
E2E (/lab/inject-participant-event com o LID real do bot no LAB):
payload capturado text "Bem-vindo @558581344211 👋" + mentionedJid
["558581344211@s.whatsapp.net"] = combo exato do probe A. Highlight
azul confirmado visualmente pelo dono no LAB.
Gates: 815 passed / 3 flaky Discord (tsc limpo; +10 testes novos).
APRENDIZADOS
- Mention Baileys = handle no texto E JID PN no array; mentions @lid
  NÃO renderizam em grupo LID (probe A/B/C, 19/10).
- group-participants.update traz participant @lid; converter via
  participants metadata (id @lid + phoneNumber) — mas NUNCA converter
  o JID de kick/ban (o Baileys espera o @lid do grupo).
- E2E de welcome no lab: conferir bemvindo=1 no group_mod ANTES de
  concluir que o handler falhou (o LAB estava com bemvindo=0 e a 1ª
  injeção "passou" sem enviar nada).

## INC-011 — Notícias desatualizadas (LLM sem browsing "lembrava" notícias) — RESOLVIDO em 30b1bf6 (20/10)

SINTOMA
- Dono reportou notícias velhas (conteúdo de anos atrás). Dedup INC-006
  ok, mas a FONTE não era fresca.

CAUSA RAIZ (F0)
- fetchNews → askAINews = chat completion PURO (sem tools/browsing):
  o prompt pedia "notícias de HOJE" a um LLM que só conhece o treino.
  Sem API de busca no .env (BRAVE/SERPER/NEWSAPI/BING/GOOGLE_SEARCH:
  nada). O modelo "lembrava" manchetes antigas ou inventava.

FIX (30b1bf6 — design F2 proposto e aprovado pelo arquiteto)
- rssNewsService.ts (novo): Google News RSS por tópico (grátis, sem
  key, pt-BR). when:2d com retry when:7d; TOPIC_QUERIES com merge de
  queries ('mundo geek' = anime/mangá/games/cultura pop + séries/
  filmes/música/marvel/dc) e dedup intra-batch; parser blindado
  (entidades, CDATA defensivo, título puro do <a> da description,
  fonte do <source>, guid estável como dedup secundário).
- fetchNews RSS-first: dedup título normalizado + guid/link (janela
  50), gravação com link+pubDate; curadoria LLM OPCIONAL com timeout
  duro 5s e sanidade tudo-ou-nada (N linhas + ≥2 palavras do título
  original por linha; qualquer desvio publica títulos REAIS cru).
  Fallback LLM declarado com disclaimer "⚠️ Fonte ao vivo
  indisponível — resumo gerado por IA".
- databaseService: ALTER TABLE news_history ADD COLUMN link TEXT,
  pub_date TEXT (addColumnIfMissing no boot — migration automática);
  recordNewsTitles aceita NewsRecord retrocompatível com string[];
  getRecentNewsLinks (dedup secundário por artigo).
- Fixtures reais COMMITADOS (tests/fixtures/google-news-*.xml,
  capturados via curl do próprio VPS) — parser testado contra o
  formato congelado do Google.

DESCOBERTAS DO FEED REAL (premissas do design ajustadas em F2)
- Feed NÃO usa CDATA; description não tem frase de resumo — o <a> da
  description carrega a manchete pura (via principal do título).
- Fonte vem como sufixo " - Fonte" no <title> E na tag <source>.
- <guid> (CBMi…) é estável por artigo; <link> carrega "?oc=5" — por
  isso o dedup secundário usa o guid.
- Feed inteiro numa linha só; parser por blocos, não por linhas.

E2E (LAB, 20/10, sender master 558898314322@c.us)
- $noticias tecnologia 5: resposta em ~3s com manchetes REAIS de
  hoje (IstoÉ/eleições, IA em reuniões, acidentes de trabalho);
  news_history gravou link=CBMi… e pub_date ISO de HOJE (não NULL).
- 2ª chamada consecutiva: 5 títulos NOVOS, 0 repetidos (dedup
  título + guid funcionando).
- $noticias mundo geek 5: merge das 2 queries com diversidade
  comprovada (Xbox/FFVII, Spotify/anime, Shingeki no Kyojin,
  Marvel/Homem-Formiga, Modern Warfare 4).
- Gates: 833 passed / 3 flaky Discord (tsc limpo; +14 testes novos,
  incluindo as 2 bordas exigidas: feed vazio → fallback com
  disclaimer; 1 item com count=5 → entrega 1 sem inventar).

APRENDIZADOS
- Entidade XML dentro de código-fonte: escrever via concat/fromCharCode
  ("&" + "lt;") — o literal sofre mangling na escrita/leitura do
  arquivo (o array ENTITIES nasceu decodificado = no-op, e o teste
  pescou antes do deploy).
- "when:2d" no q= sai URL-encoded (when%3A2d): asserts de teste
  precisam decodeURIComponent antes do toContain.
- extractTitles stripa numeração e fonte — a curadoria precisa das
  LINHAS CRUAS da resposta (validadas), não do extrator.
- Curadoria de fonte única (só títulos sem corpo): tudo-ou-nada;
  nunca misturar linha curada com cru.
- Parser testado contra fixture REAL congelado: se o Google mudar o
  formato, o CI aponta a regressão na hora.

## INC-012 — VPS inacessível por Tailscale (ABERTO, 21/10 — infra; NÃO afeta o bot)

SINTOMA
- SSH (solanojr@100.101.218.16) com timeout; ping com 100% de perda.
- O bot CONTINUA online no WhatsApp — o node sobreviveu; só o acesso
  externo à máquina caiu.

DIAGNÓSTICO (feito da máquina local, 21/10 ~00:15)
- `tailscale status` local: esta máquina (solanojr-1, 100.92.50.5) OK
  e conectada; o nó `ubuntu` (100.101.218.16) aparece como
  "offline, last seen 3h ago" — caiu da tailnet entre 21h-22h de 20/10,
  pouco depois do deploy INC-011.
- Processos locais ok: tailscaled.exe ×2 + tailscale-ipn.exe rodando.
- TCP porta 22 (via /dev/tcp): inalcançável.
- curl http://100.101.218.16:3001/metrics: HTTP 000 (timeout).
- tracert -h 10: pacote sai da rede local, passa o gateway
  192.168.x → 100.70.128.1 (backbone do overlay) e morre — o peer
  VPS não responde a partir do hop 4.

CONCLUSÃO
- Problema NO LADO DO VPS (tailscaled/daemon ou link dele), não na
  rede local nem no bot. Tailscale local está saudável.

RECUPERAÇÃO (exige acesso por outra via — console do provedor)
- Entrar pelo painel do provedor (console/VNC) e rodar:
  `sudo systemctl restart tailscaled && sudo tailscale status`
- Verificar `uptime` — se o VPS reiniciou, o tailscaled pode não ter
  subido junto.
- Após a volta: executar o reset pendente do working copy
  (`git reset --hard origin/main && git rev-parse HEAD` — docs df5eb4e
  ainda não sincronizados) e o push+deploy do INC-012b.
- Mitigação (21/10): watchdog PRONTO — `laboratorio/install-tailscale-watchdog.sh`
  (no repo e em /tmp do VPS, sintaxe validada). Instalação exige sudo com
  senha (o agente não digita senha): rodar no console do VPS
  `sudo bash /tmp/install-tailscale-watchdog.sh`. O watchdog reinicia o
  tailscaled se `BackendState != Running` ou `Self.Online != true` — cobre
  o caso real (processo vivo, nó caído da tailnet), a cada 5min.
- Retomada (21/10 ~15:30): tailscaled `active (running)` DESDE O BOOT de
  20/10 17:27 — o processo não caiu; a tailnet reconectou sozinha depois
  de ~20h de nó offline. Bot ficou online o tempo todo (uptime 22h,
  0 restarts). Push INC-012b + deploy normalizados sem intervenção.

## INC-013 — Manutenção/health-check do VPS: DNS quebrado + hardening (FECHADO 100%, 21/10)

SINTOMA
- F1 (script de manutenção): `apt-get install fail2ban unattended-upgrades`
  falharam SEM mensagem (5/7 passaram). Motivo do silêncio: meu script
  engolia stderr com `>/dev/null 2>&1` (bug meu, corrigido no REPAIR).
- Mask de motd-news prendeu o estado "failed"; snap.cups.cupsd não
  aceitou mask (unit de snap é arquivo REAL em /etc/systemd/system —
  symlink de mask não sobrescreve; caminho certo: `snap remove cups`).

CAUSA RAIZ (apt)
- resolv.conf apontava para 100.100.100.100 (MagicDNS Tailscale) e o
  nó caiu da tailnet no INC-012 → DNS morto → apt falhava na descarga.
- Evidência: dist-upgrade de 18/10 (pré-queda) OK; installs de 21/10
  falhavam; `dpkg --audit` limpo e candidates presentes (não era repo
  nem dpkg); `getent` vazio pós-boot de 20/10 17:27.

FIX IMEDIATO (F1-REPAIR, 7/7)
- DNS condicional: getent falha → backup resolv.conf.bak-f1 →
  1.1.1.1/8.8.8.8 → re-teste. apt com output VISÍVEL (nada engolido).
- Instala fail2ban (jail sshd, ignoreip 127.0.0.1/8 ::1 100.64.0.0/10
  — tailnet inteira na whitelist, dono nunca se auto-bane) +
  unattended-upgrades (security-only, sem auto-reboot).
- `systemctl reset-failed` (motd-news/cups) + `snap remove cups`.

FIX DEFINITIVO (DNS)
- `tailscale set --accept-dns=false` (aplicado sem sudo — o socket do
  tailscaled aceita; set_exit=0). Preferência PERSISTIDA no StateStore
  (CorpDNS: false) — o tailscaled nunca mais empurra 100.100.100.100
  no resolv.conf, nem após restart/boot. MagicDNS por nome (.ts.net)
  deixa de resolver neste nó — irrelevante: acessos sempre por IP.
- Nota: resolv.conf atual é o manual (1.1.1.1/8.8.8.8; o REPAIR
  sobrescreveu o bloco "# --- BEGIN PVE ---" com `>`). No próximo
  boot o Proxmox regenera com os DNS do host (funcionais) + marcador;
  com accept-dns=false o Tailscale não re-contamina. Ambos caminhos
  cobertos. Backup do original: /etc/resolv.conf.bak-f1.
- Teste de resiliência EXECUTADO (21/10 17:45, systemd-run detached —
  restart do tailscaled derruba o túnel que carrega o SSH): 5/5 PASS.
  (1) resolv.conf pós-restart SEM 100.100.100.100 (1.1.1.1/8.8.8.8);
  (2) getent exit=0; (3) apt-get update baixou 6.757 kB das listas
  sem erro de resolução; (4) tailnet reconectada (SSH reentrou);
  (5) CorpDNS: false persistido. Log: /tmp/f1-dns-resilience.log.
  INC-013 fechado com resiliência comprovada.

MELHORIAS APLICADAS (F1 + REPAIR)
- SSH: PermitRootLogin no (backup sshd_config.bak-f1; validado com
  sshd -t antes do reload). Sem IP público (eth0 192.168.30.x, rede
  privada do Proxmox) → ufw dispensado.
- fail2ban + unattended-upgrades (acima).
- journald: SystemMaxUse=200M → journal 465M → 16M (vacuum).
- pm2-logrotate (como solanojr): 50M, 7 cópias, comprimido, 03:00.
- Timer mensal root (manutencao-mensal): journal vacuum 30d, apt
  autoremove/autoclean, WAL checkpoint, TESTE DE RESTORE do backup
  (PRAGMA integrity_check). Desvio do literal "crontab do usuário":
  sudo interativo não funciona em cron; systemd timer root, mesmo
  padrão do watchdog tailscaled.
- Limpezas: lixo "'" (bug de quoting do F0 meu), WAL checkpoint,
  mask+reset-failed motd-news, snap remove cups.
- Load 2.5 sustentado: artefato de LXC (loadavg do host Proxmox;
  CPU 87.5% idle no container) — sem ação.

ESTADO FINAL (21/10, FASE E verificada)
- Disco 63% → 53% (15G livres) · journal 16M · 0 services failed ·
  DNS ok (getent exit=0) · fail2ban/unattended ativos · bot intacto.
- Snaps D1+D2: ~2.8G liberados nos ARQUIVOS (snapd ~3G → 46M; só
  bare + snapd restantes; refresh.retain=2). df do LXC não reflete:
  /dev/loop2 é backing file no Proxmox que não encolhe. F1.2
  diagnosticou o "não liberou" como FALSO ALARME (gap df-du = 2MB,
  lsof +L1 vazio — sem deleted-but-open).
- Monitor nível 3 INSTALADO E TESTADO: wpp-monitor.sh a cada 5min
  (disco >85%, mem >90%, tailscale, pm2 bot-wpp) com cooldown 1h,
  alerta 🔴 + recuperação ✅. Alertas no PRIVADO do dono
  (146078742) via TELEGRAM_ALERT_CHAT_ID; TELEGRAM_CHAT_ID do grupo
  (-1003470059875) preservado para as apresentações. Teste real
  confirmado visualmente pelo dono (🔴+✅ no privado).
- Descoberta do chat_id: log do bot ("[Telegram] Mensagem recebida:
  {...chatId:146078742}", $ping do dono às 18:49:38) — getUpdates
  veio vazio porque o bot consome updates via polling
  (getWebhookInfo.url null). Token nunca saiu do VPS.
- 3 timers ativos: check-tailscaled (5min), wpp-monitor (5min),
  manutencao-mensal (dia 1, 04:00, com teste de restore do backup).

PENDÊNCIAS → ENCERRADAS (21/10)
- Snaps GUI: RESOLVIDO (D1+D2, acima).
- Monitoramento nível 3: RESOLVIDO (acima).
- /var/log: nada a limpar (retificado — os "~2.8G" eram journal
  arquivado, consumidos pelo vacuum).
- Restam (fora do INC-013, no BACKLOG): render watchdog, $clima,
  app PC devtools, Dependabot (32 vulns, 5 crit), dívidas de
  permissão 1-3.

## INC-012b — $setwelcome ADITIVO (feature de design, 21/10)

- Correção do dono: o welcome NÃO substitui o default — é aditivo.
  `composeWelcome(texto)`: se o texto já contém 'Boas-vindas',
  '@novato' ou '{handle}' (template completo/legado), volta como está;
  senão salva `DEFAULT_WELCOME + "\n\n" + texto`.
- `$setwelcome reset|default` → NULL (padrão puro);
  `$setwelcome --full <texto>` → template cru.
- renderWelcome deixou de colapsar TODO whitespace (\s+ → espaço):
  agora preserva quebras de linha (`[^\S\n]+` por linha, `\n{3,}` →
  `\n\n`) — sem isso o composto multi-linha viraria uma linha só.
- Testes: welcome.test.ts (+4) e setwelcome.test.ts (novo, +11).
- RESOLVIDO (21/10): push `11f59ac` + deploy padrão (backup, build,
  sourced restart, boot 0 erros, metrics 200). E2E no LAB com 3 provas
  capturadas em `laboratorio/captured-messages.jsonl`:
  1. `$setwelcome Bem-vindo ao grupo!` → banco gravou
     `'Boas-vindas @novato 👋\n\nBem-vindo ao grupo!'` (composto exato);
  2. join injectado (LID 2592935567439@lid) → welcome OUTGOING capturado:
     `'Boas-vindas @558581344211 👋\n\nBem-vindo ao grupo!'` — handle PN
     real, 2 linhas, 1 mention (highlight);
  3. `$setwelcome reset` → reply `✅ Welcome resetado para o padrão`,
     banco NULL, e novo join enviou APENAS `'Boas-vindas @558581344211 👋'`.
  E2E comprovado com 32/32 testes locais + tsc + 848 passed/3 flaky Discord.

## INC-014 — Dependabot prod + $clima testado (RESOLVIDO 21/10)

Sintoma/mandato: projeto "liso" antes dos testes manuais do dono.
F0 (audit no VPS): 5 vulns em PROD (1 critical proxy-addr, 3 high
undici/sharp/follow-redirects, 1 moderate music-metadata) + 25 dev.
Contexto real: VPS sem IP público, HTTP só em 127.0.0.1 → nenhuma
explorável externamente; music-metadata era o único caminho de input
externo (DoS de event loop via MP4 malformado).
Fix: `npm audit fix` (sem --force) — 0 vulnerabilities em prod
(confirmado por `npm audit --production`). Pacotes bumpados:
follow-redirects 1.11.3, sharp 0.35.5, undici 6.29.1, proxy-addr,
music-metadata (+ vite dev). discord.js/baileys/ws NÃO mudaram
(diff do lock verificado). Sobraram 22 dev (2 critical do tinypool —
fix exige vitest@5 breaking; backlog).
Gates: tsc 0 erros; suite 848 passed + 3 flaky KNOWN (adapters.test.ts,
DiscordAdapter, timeout 10s — mesmo perfil do baseline; lock não tocou
discord.js/baileys/ws).
Deploy (22/10 00:20 UTC): backup /tmp/bw-1792631543 → canary 5fb59f9
(npm ci com lock novo + build + boot isolado limpo) → prod reset →
"🎉 Todas as plataformas prontas", 0 [ERROR] no boot, lab adapter 200.
Smoke: inject `$alive` (master via PN) → "✅ *BOT ONLINE*" com quote.
Commit: 5fb59f9.

$clima — TESTADO E FUNCIONANDO (21/10, fecha pendência do INC-005):
Open-Meteo keyless (geocoding+forecast), zero var no .env, APIs 200/200
do VPS. Inject no LAB às 20:43 → resposta real em 7s: "☁️ CLIMA EM
SÃO PAULO" (weathercode real da API). Pendência de verificação de
runtime ENCERRADA.

## INC-015 — Dívidas de permissão (em andamento, 21/10)

Dívida 1 — stub checkPermissions removido (RESOLVIDO):
- F0: `checkPermissions` em PlatformManager.ts sempre retornava true
  (stub inerte) + bloco de telemetry 'rejected' morto no dispatcher.
- Fix: função + chamada removidas; comentário arquitetural no dispatcher:
  "Gating é por handler (isMaster/isSenderGroupAdmin); middleware central
  não existe por decisão arquitetural."
- Gates: 63/63 no groupAdminKickBan.test.ts (arquivo do dispatcher),
  tsc 0 erros, suite 848 passed + 3 flaky (= baseline exato).
- Deploy 1698e25 (via a4e3a8c): canary boot limpo → prod reset →
  "🎉 Todas as plataformas prontas", 0 [ERROR], lab 200, smoke $alive
  "✅ *BOT ONLINE*".
- E2E f1-perms.sh (commitado em laboratorio/): **7/7 verde** —
  comum negado em master-only, públicos respondendo, master via PN E
  via LID executando, 0 self-triggers. Rede de segurança: nenhum nível
  perdeu permissão.
- Nota técnica: o log [reply] não carrega o texto da resposta; o E2E
  lê laboratorio/captured-messages.jsonl (texto em
  rawPayloadSafe.message.extendedTextMessage.text) — f1-perms.sh
  documenta o padrão.

Dívida 2 — $cmd toggle persistido + leitor (RESOLVIDO, 22/10):
- F0 revelou 2 falhas: commandConfigService era Map em memória (estado
  morria no restart) E isEnabled() não tinha leitor — o $cmd gravava um
  estado que nada consultava. O E2E achou uma 3ª: o toggle gravava o
  alvo crudo ("$ping") enquanto o dispatcher consulta command.name sem
  prefixo ("ping") — nunca casavam. O comando era inócuo por design tripla.
- Fix (1949c2d): tabela command_state (group_id, command PK, enabled,
  updated_at) no initSchema; service reescrito em cima do getDb() com
  default HABILITADO (ausência de registro = true) e fail-open (banco
  fora → isEnabled true; o toggle nunca derruba o bot); gate no
  dispatcher entre rate-limit e execute — reply "⚠️ O comando \`X\` está
  desativado neste grupo. (\`$cmd X on\` reativa)"; $cmd imune ao próprio
  gate (desativá-lo = lock-out). Telemetry outcome 'rejected' (a tabela
  command_logs tem CHECK constraint sem 'disabled'; rebuild não compensa).
- Fix (18d4f79): cmdToggle normaliza o alvo com strip de $/# — grava
  "ping", o mesmo nome que o gate consulta.
- Gates: tsc 0; 851 passed + 3 flaky (= baseline + 5 novos testes do
  service: default habilitado, upsert off/on, estado sobrevive a nova
  instância, fail-open, grupos independentes).
- Deploy 18d4f79: canary boot limpo → prod → "🎉 prontas", 0 [ERROR],
  lab 200, tabela command_state criada no banco de produção.
- E2E F3 no LAB (6/6, sender = master via PN):
  $cmd $ping off → "✅ Comando ping desativado" / $ping → negado pelo
  gate / pm2 restart / $ping → AINDA negado (persistência SQLite provada
  — a dívida era exatamente "morria no restart") / $cmd $ping on →
  ativado / $ping → pong real.
- Armadilha do E2E (registrada): o número do bot (558581344211) não é
  o master — isMaster false por isBotTarget. Injects de master exigem
  sender MASTER_USER do .env + @c.us, não hardcode do número do bot.
- Limpeza opcional: row órfã command_state ("$ping", do período do bug)
  é inofensiva — nunca consultada; DELETE pendente de aprovação.

INC-016 — RENDER WATCHDOG DO SCREENSHARE (RESOLVIDO 22/10, suíte 96/96)
Sintoma: freeze do screenshare com bufferedAmount saudável (INC-005).
Fix: watchdog client→server "rendered" a cada 2s; >4s sem pintura COM
rede viva → requestKeyframe. Falsos positivos excluídos: aba oculta,
rede morta, WebRTC, heartbeat velho, cooldown 8s. Implementado como
pendência do INC-005 (sem bloco próprio até 25/10 — registrado aqui por
consistência com o HANDOFF §4). Pendências: log real "keyframe pedido"
(exige transmissão ao vivo) + app PC tela preta (causa pré-JS — devtools
na Activity, ação do dono).

INC-017 — Apresentação: coletor surdo + heurística de nome + env vazio (RESOLVIDO 621bae7/03d30e5, 23/10)
Sintoma: inject de apresentação no LAB processado ([PM] trigger=none), mas
ZERO sessões, ZERO rows — e nenhum log. O E2E parecia "não acontecer".

Causa raiz (3 bugs em série, cada um mascarando o próximo):
1. handlePresentationCollect lia `normMsg?.senderId`/`messageId`; o
   BaileysNormalizer produz `userId`/`id`. O gate `!senderId` retornava
   ANTES de qualquer log — silêncio total. O teste antigo passava porque o
   mock foi escrito com o MESMO shape errado (teste pinou o bug, não o
   contrato).
2. extractFields "primeira linha" usava `texts[0]` inteiro (sem split \n):
   mensagem multi-linha (>40 chars) nunca extraía nome.
3. `TELEGRAM_PRESENTATION_CHAT_ID ?? fallback`: o pm2 --update-env faz
   MERGE e deixa a var vazia no processo; `??` mantém '' e `Number('')`=NaN
   mataria a publicação. Chat agora `||` (vazio = fallback); thread
   permanece `??` (vazio é legítimo: privado sem tópicos).

Detecção rápida: cd ~/bot-wpp && node laboratorio/probe-presentation-collect.js
(gates, sinais, sessão, consolidação — sem deploy, sem Telegram).

Prevenção: o novo caso do presentationFlow.test prende o CONTRATO REAL do
normalizer (userId/id); probes standalone contra o dist provam o serviço
antes de culpar o pipeline.

E2E (23/10): inject real → sessão → consolidate (tick 2min) → SQLite →
publisher no PRIVADO (146078742): msg 202 (texto: nome/idade/trabalho
limpos) + msg 203 (sendPhoto picsum + legenda). Grupo Teste precisou
community_id setado + presentation_enabled=1 (gates silenciosos em série).
Limpeza aplicada: enabled=0, community_id='', rows de teste deletadas,
envs de teste zeradas (fallback de produção restaurado, thread 2).

INC-018 — TESTE 2 (welcome real): sensor cego de admin + add não aceita LID (RESOLVIDO 197aae4/606900e, 23/10)
Sintoma: /lab/group-info novo lia admin:null para TODOS os 47 participantes
do Figurinhas (impossível — todo grupo tem criador); e o add do ciclo
remove→re-add retornava "bad-request" cru.

Causa raiz (2 bugs, um deles do próprio probe desta rodada):
1. O chatManager entrega participants mapeados como isAdmin/isSuperAdmin
   (booleans); o campo `admin` do metadata cru NÃO sobrevive ao mapping.
   As rotas novas liam p?.admin → sensor cego. Fix: ler os campos mapeados.
2. groupParticipantsUpdate(action='add') aceita PN, não LID: com o JID @lid
   do alvo → bad-request; com o phoneNumber mapeado → 200 + join. (O
   'remove' aceita LID normalmente — assimetria provada por execução.)

Detecção rápida: /lab/group-info varre todos os grupos e lista admins por
phoneNumber; add que falhar com bad-request → tentar o PN do participant.

E2E (23/10, Figurinhas): remove 200 (13:11:35) → add com LID bad-request
→ restaurado via /lab/restore-member com PN (200, join_time 13:19:30) →
GROUP_PARTICIPANTS_UPDATE action=add 13:19:31 → [BaileysSender.sendMessage]
mentions anexados: 1 (13:19:32) → [memberJoinService] welcome enviado
(13:19:33) → captured-messages.jsonl: text "Boas-vindas @558586060790 👋"
+ mentionedJid ["558586060790@s.whatsapp.net"] (PN, não LID) →
mod_member_joins id=162. TESTE 2 APROVADO: o combo handle-no-texto +
PN-no-mentions rendeu highlight real; resolvePn converteu LID→PN no
evento @lid. A rota agora adiciona pelo phoneNumber quando existe.

INC-019 — Violação de escopo: teste de welcome executado no Figurinhas em vez do Grupo Teste (23/10)
O usuário é categórico: "APENAS O GRUPO TESTE TEM PERMISSÃO PRA FAZER
TESTES". O TESTE 2 removeu/re-adicionou um membro real no Figurinhas
(120363419033272638@g.us) — grupo de produção — quando o alvo autorizado
era o Grupo Teste (120363410094452673@g.us). O membro foi restaurado no
mesmo dia (confirmado via /lab/group-info: presente, 46 participantes).

REGRA PERMANENTE: todo teste E2E que muda estado de grupo/membro
(remoção, adição, join, inject de mensagem, kick/ban de teste) roda
APENAS em 120363410094452673@g.us. Se o bot não for admin lá, a única
exceção é pedir ao usuário — nunca migrar o teste para outro grupo por
conta própria. Leitura (group-info, DB, logs) continua livre em qualquer
grupo.

O Figurinhas foi restaurado ao estado original e nenhuma mensagem de
teste adicional foi enviada lá. As 3 mensagens de apresentação da rodada
anterior foram injetadas no Grupo Teste (correto).

INC-020 — Apresentação: default aditivo + aviso no join + confirmação imediata no grupo; feedback com espelho Telegram (23/10)
Pedido do arquiteto em 4 pontos, todos implementados no commit 8339da0
(push 99448001..8339da07, deploy 3 pernas verdes 19:53):

P1 — DEFAULT_PRESENTATION_MESSAGE + composePresentationMessage (aditivo,
mesmo padrão do composeWelcome) em welcomeService; coluna
group_mod.presentation_message via addColumnIfMissing; memberJoinService
envia o aviso no join quando presentation_enabled=1 (gate PRÓPRIO — sai
mesmo com bemvindo=0). Testes: welcome.test (compose/fallback/join on/off).

P2 — handlePresentationCollect retorna contexto (opened/trigger/messageId/
text) e a ABERTURA de sessão persiste row 'collecting' no SQLite na hora;
BaileysMessageNormalizer responde no grupo "📝 Apresentação recebida! Vou
salvar no nosso grupo do Telegram." quotando a mensagem que abriu a sessão
(presentationConfirm, trigger notice_reply OU signals). Consolidação de
10min inalterada (template final no Telegram). DOIS fixes críticos achados
pelos testes: persistPresentation encerrava a sessão em memória em TODO
upsert (só deve encerrar no status 'consolidated') e o upsert conflitava
com o unique idx (platform, group_id, user_id) — ON CONFLICT corrigido.

P3 — feedbackWorker expõe getRegisteredFeedbackSend(); o send registrado
no multiPlatform ganha espelho Telegram (TELEGRAM_FEEDBACK_CHAT_ID — em
prod 146078742) disparado ANTES do PV. Em E2E com fake, o PV falha por
design (número sem WhatsApp) e o espelho é a evidência de observabilidade.

P4 — E2E no Grupo Teste (20:02-20:22). ACHADO: o add do zero do
5585999999999 agora é recusado pelo servidor com 451 (número sem
WhatsApp; nas rodadas anteriores o "re-add" funcionava porque ele já
estava no grupo). O remove-and-add real exige participante presente —
decisão do usuário: /lab/inject-participant-event add→remove→add, que
dispara os handlers reais sem mexer em ninguém. Evidências literais:
welcome "Boas-vindas @5585999999999 👋" (2x) + aviso default enviado
logo após ("[memberJoinService] aviso de apresentação enviado");
feedback_events row group_leave/pending; inject de resposta quotando o
aviso (contextInfo provado no wire) → confirmação imediata no grupo
"📝 Apresentação recebida!..." COM QUOTE na mensagem do novato (contextInfo
literal no capture); DB collecting com nome/idade/trabalho extraídos;
consolidação → resposta no grupo com template (👤 *João Silva* / 🎂 30
anos / 💼 informática) citando a msg do novato; publicação no Telegram
privado tg_chat_id=146078742 tg_message_id=212; feedbackWorker
sent=0 failed=1 (PV fake, esperado) + zero warns do espelho (entregue).

/lab/inject-message agora aceita quotedStanzaId/quotedParticipant/
quotedText; /lab/run-feedback-worker dispara um ciclo do worker sem
esperar as 6h (workerStarted guard já existia). TELEGRAM_FEEDBACK_CHAT_ID
appendado ao .env da VPS (backup em /tmp/bw-1792795702/env-backup-feedback)
com sourced restart; var confirmada no /proc environ do processo.

F2: apresentação e feedback_events de teste deletados do DB; toggles do
Grupo Teste mantidos (presentation_enabled=1, feedback=1, bemvindo=1);
nenhum outro grupo tocado. Pendente: usuário indicar grupos reais p/
ativar presentation_enabled/feedback (só configurar, sem testar lá).
Backlog: espelho do feedback não loga o message_id do Telegram no
sucesso (só warn na falha) — adicioná-lo quando o feedback voltar ao foco.

INC-021 — E2E com pessoa REAL (Caio, 558596700100 / LID 72576558715022),
22:00-22:50. Aprovado pelo usuário (Caio destituído de admin; sabe do teste).
Deploy prévio: 23d1133 (notificador da resposta) + 735166d (rota nova
/lab/remove-member — remove SOLTO, sem re-add; proteções MASTER/bot/admin;
testes de contrato 400/503 em testServerHttp).
BUG 1 (84de488): recordExitEvent gravava phone_number NULL — o handler
procurava o removido no cache DEPOIS da saída (hit=undefined). O PN vem no
próprio evento (Baileys entrega participants como objetos {id, phoneNumber,
admin}); fix extrai raw.phoneNumber com fallback no cache.
BUG 2 (7747e611): o send do feedbackWorker passava sendMessage(userId, {text})
onde BaileysAdapter.sendMessage(chatId, text: STRING) — objeto é rejeitado
silenciosamente pelo sender; o PV nunca saía e o worker contava failed.
Era a causa também do failed:1 do fake em INC-020 (não era o fake).
COLATERAL: o worker periódico gastou a 3ª tentativa com o dist antigo →
evento expired/attempts=3 às ~22:21; reset pontual status=pending
attempts=0 no DB (as falhas eram dos bugs corrigidos).
Fluxo real provado: remove 21:59 status 200 (GROUP_PARTICIPANTS_UPDATE
literal) → evento group_leave REAL no DB → janela 10min → worker sent=1
22:25:26 (PV no WhatsApp real do Caio; usuário conferiu no aparelho) →
Caio RESPONDEU 22:30:41 "Achei homofobia da parte de quem me tirou" →
status responded + bot agradeceu no PV dele (fromMe extendedText com
quote) + 📩 ao Telegram do dono (TELEGRAM_ALERT_CHAT_ID; caminho não
loga sucesso — sem WARN = entregue; confirmação visual pendente) →
restore-member add 22:34:50 status 200 (join_time literal) →
[memberJoinService] welcome enviado 22:34:52 + aviso de apresentação
enviado 22:34:53. Passo 6: Caio não respondeu o aviso na janela de 15min
— DOCUMENTADO "aguardando resposta do Caio" (regra do runbook; não é
falha do bot). Gatilho do passo 6 = quote ao aviso (sem TTL).
TELEGRAM_FEEDBACK_CHAT_ID esvaziado no .env da VPS (22:18) a pedido do
usuário: o PEDIDO vai só ao PV do removido; a RESPOSTA (📩) vem ao
privado dele. Backup .env em /tmp/bw-env-backup-feedback-mirror.
Pendências: confirmação visual da 📩 (usuário) + apresentação do Caio
(quote ao aviso, sem prazo) + espelho sem message_id (backlog INC-020).

INC-022 — Prova funcional E2E do $promover (fix a47fe6a) + /lab/promote-member
Data: 25/10/2026 · SHA: 7143873 · Status: RESOLVIDO (prova concluída)
Contexto: $promover respondia "não suportado nesta plataforma" (0 adapters
implementavam promoteParticipant — auditoria P1). Fix a47fe6a adicionou
promoteParticipant no PlatformTypes + BaileysAdapter (groupParticipantsUpdate
'promote', status≠200 → erro claro) + comando com PN mapeado. Só unit-testado.
Prova:
- Rota /lab/promote-member criada (7143873): proteções idênticas ao
  remove-member (MASTER/bot/alvo já admin → 400; bot não admin → 400; sem
  adapter → 503; alvo ausente → 400). Chama adapter.promoteParticipant REAL.
- Testes: 400 sem params, 503 sem adapter (testServerHttp 13/13); suite
  945 passed / 3 skipped.
- F3 no Grupo Teste 18:50:33: candidato 84607231905945@lid (PN 639474500179,
  conta de teste) promovido → 200 {ok, steps:['promoted']} → /lab/group-info
  confirma admin:'admin' (admins do grupo: 4 = candidato + MASTER superadmin
  + 27445294006297 + bot).
DECISÃO: interface NÃO tem demote (rota fantasma removida na auditoria;
$demote não existe como comando). NÃO criar /lab/demote-member (escopo).
REVERSÃO MANUAL: dono remove o admin pelo WhatsApp (Grupo Teste →
info do grupo → abrir PN 639474500179 → remover como admin). Pendente no
usuário; candidato é conta de teste num grupo de teste (sem risco).
Prova complementar do comando no chat: $promover @candidato no Grupo Teste
(exercita o path completo do comando — dispatcher → permissions → adapter).
