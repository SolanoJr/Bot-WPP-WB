/**
 * INC-006 — F1: o filtro "NÃO repita" funciona num LLM real?
 *
 * Para 3 temas, duas chamadas ao Groq (mesmos params do askAINews):
 *   (a) réplica EXATA do buildNewsPrompt atual (sem filtro)
 *   (b) o mesmo prompt + bloco "NUNCA repita estes títulos" com 2
 *       títulos FICTÍCIOS porém plausíveis — se fossem absurdos, o
 *       LLM nunca os geraria e o probe não provaria nada.
 *
 * Overlap medido entre a resposta (b) e os fictícios (string
 * normalizada: minúsculas, sem pontuação, espaços colapsados).
 * Esperado: 3/3 sem overlap.
 *
 * Uso (VPS, com o .env no ambiente): node laboratorio/probe-news-dedup.js
 */

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'qwen/qwen3.8-27b';

/** Réplica do buildNewsPrompt atual (newsService.ts:58). */
function promptAtual(topic, count) {
  const tema = topic ? `"${topic}"` : 'os principais acontecimentos do dia';
  return `Liste as ${count} notícias mais relevantes de HOJE sobre ${tema}.
Formato da resposta (texto puro, sem markdown, sem negrito, sem itálico):
1. Título curto — 1 frase resumindo
Não inclua cabeçalho, rodapé, fonte ou introdução.
Apenas a lista numerada, uma notícia por linha.
Se não encontrar notícias do dia, use as mais recentes da semana.`;
}

/** Variação proposta: mesmo prompt + filtro de já-enviados. */
function promptComFiltro(topic, count, recentTitles) {
  let p = promptAtual(topic, count);
  if (recentTitles.length > 0) {
    p += `\nNUNCA repita os títulos abaixo — já foram enviados a este grupo antes:
${recentTitles.map((t) => `- ${t}`).join('\n')}`;
  }
  return p;
}

async function groq(prompt) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error('GROQ_API_KEY ausente no ambiente');
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.4,
      max_tokens: 800,
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('resposta vazia');
  return content.trim();
}

/** Regex do extractTitles proposto: "N. Título — resto". */
function extractTitles(text) {
  const out = [];
  for (const m of text.matchAll(/^\s*\d+\.\s+(.+?)\s+—/gm)) out.push(m[1]);
  return out;
}

function normalize(t) {
  return t
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const TEMAS = [
  {
    tema: 'tecnologia',
    ficticios: [
      'Apple anuncia iPhone 18 com bateria de grafeno e 40% mais autonomia',
      'OpenAI lança GPT-6 para desenvolvedores com foco em raciocínio',
    ],
  },
  {
    tema: 'games',
    ficticios: [
      'GTA 6 tem data de lançamento oficial confirmada pela Rockstar',
      'Nintendo revela sucessor do Switch 2 com VR integrada',
    ],
  },
  {
    tema: 'anime',
    ficticios: [
      'One Piece anuncia novo arco de animação para 2027',
      'Studio Ghibli anuncia novo filme dirigido por Hayao Miyazaki',
    ],
  },
];

async function main() {
  let overlapTotal = 0;
  for (const { tema, ficticios } of TEMAS) {
    console.log(`\n════════ TEMA: ${tema} ════════`);

    const [semFiltro, comFiltro] = await Promise.all([
      groq(promptAtual(tema, 3)).catch((e) => `(a) FALHOU: ${e.message}`),
      groq(promptComFiltro(tema, 3, ficticios)).catch((e) => `(b) FALHOU: ${e.message}`),
    ]);

    const titulosA = typeof semFiltro === 'string' && !semFiltro.startsWith('(a)')
      ? extractTitles(semFiltro)
      : [];
    const titulosB = typeof comFiltro === 'string' && !comFiltro.startsWith('(b)')
      ? extractTitles(comFiltro)
      : [];

    console.log('(a) SEM filtro  →', titulosA.length ? titulosA.join(' | ') : semFiltro);
    console.log('(b) COM filtro  →', titulosB.length ? titulosB.join(' | ') : comFiltro);

    const normFict = ficticios.map(normalize);
    const overlap = titulosB.filter((t) => normFict.includes(normalize(t)));
    console.log(`    overlap (b)×fictícios: ${overlap.length}${overlap.length ? ' ← ' + overlap.join(' | ') : ''}`);
    if (overlap.length > 0) overlapTotal++;
  }
  console.log(`\n════════ RESULTADO: ${overlapTotal}/3 temas com overlap ${overlapTotal === 0 ? '— filtro FUNCIONA' : '— precisa reforço no prompt'} ════════`);
}

main().catch((e) => {
  console.error('probe falhou:', e.message);
  process.exit(1);
});
