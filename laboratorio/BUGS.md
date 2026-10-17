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
