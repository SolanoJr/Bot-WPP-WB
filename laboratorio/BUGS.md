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
