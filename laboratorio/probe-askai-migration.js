#!/usr/bin/env node
/**
 * probe-askai-migration.js — INC-002 parte 2 (docs/RULES.md, Regra 5):
 * probe do pipeline proposto pro askAI (Groq primário → Gemini-compat
 * fallback) usando o PROMPT REAL do $pergunta.
 *
 * Rodar no VPS: cd ~/bot-wpp && node laboratorio/probe-askai-migration.js
 * Nunca imprime valor de key.
 *
 * ⚠ O systemInstruction abaixo é RÉPLICA LITERAL do aiService.ts — manter
 * em sincronia se o prompt mudar lá.
 */
const path = require('path');
const axios = require('axios');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const GROQ_KEY = process.env.GROQ_API_KEY;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
if (!GROQ_KEY || !GEMINI_KEY) {
  console.error('PARE: GROQ_API_KEY/GEMINI_API_KEY ausentes no .env.');
  process.exit(1);
}

// ── RÉPLICA do aiService.ts (manter em sincronia) ────────────────────────
const now = new Date();
const dateTimeStr = now.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
const context = ''; // sem histórico no probe — só o prompt importam aqui
const systemInstruction = `Você é o Bot-WPP, um assistente ultra-inteligente, estratégico e direto.
Sua personalidade é profissional, mas com um toque de sarcasmo inteligente.
Evite respostas infantis ou excessivamente longas.
Seja útil, mas mantenha sua postura de "superioridade tecnológica".

Data/Hora atual: ${dateTimeStr}

Contexto da conversa anterior:
${context}`;
const userPrompt = 'qual a cor do céu?';
// ─────────────────────────────────────────────────────────────────────────

const PROVIDERS = [
  { name: 'groq qwen3.8-27b', url: 'https://api.groq.com/openai/v1/chat/completions', key: GROQ_KEY, model: 'qwen/qwen3.8-27b' },
  { name: 'gemini-compat 3.8-flash', url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', key: GEMINI_KEY, model: 'gemini-3.8-flash' },
];

async function probe(p) {
  const t0 = Date.now();
  try {
    const r = await axios.post(p.url, {
      model: p.model,
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: `Pergunta atual: ${userPrompt}` },
      ],
      max_tokens: 1024,
      temperature: 0.7,
      top_p: 0.95,
    }, { headers: { Authorization: `Bearer ${p.key}`, 'Content-Type': 'application/json' }, timeout: 30000, validateStatus: () => true });
    const lat = Date.now() - t0;
    if (r.status !== 200) {
      console.log(`${p.name.padEnd(24)} HTTP ${r.status}  ${lat}ms  msg=${String(r.data?.error?.message || '').slice(0, 160)}`);
      return;
    }
    const c = (r.data?.choices?.[0]?.message?.content || '').trim();
    console.log(`${p.name.padEnd(24)} HTTP 200  ${lat}ms  content=${c ? 'SIM' : 'VAZIO'}  chars=${c.length}`);
    console.log(`    texto="${c.slice(0, 220)}"`);
  } catch (e) {
    console.log(`${p.name.padEnd(24)} ERRO ${Date.now() - t0}ms  ${e.code || e.message}`);
  }
}

(async () => {
  console.log('system (réplica aiService.ts) = ' + JSON.stringify(systemInstruction).slice(0, 160) + '…');
  console.log('user = "Pergunta atual: qual a cor do céu?"\n');
  for (const p of PROVIDERS) await probe(p);
})();
