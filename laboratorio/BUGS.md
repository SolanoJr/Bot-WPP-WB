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

INC-002 — askAI/$pergunta com gemini-2.5-flash nativo (ABERTO)
Sintoma esperado: $pergunta respondendo erro em produção (mesma
depreciação "new users").

Causa raiz: aiService.askAI usa endpoint nativo do Gemini com
gemini-2.5-flash — descontinuado para contas novas.

Fix: rodada própria — probe (Regra 5) com gemini-3.8-flash no
endpoint nativo primeiro, depois trocar/testar.

Detecção rápida: probe (a criar junto do fix) + log ao usar $pergunta.

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
