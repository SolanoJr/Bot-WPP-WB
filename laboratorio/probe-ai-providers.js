#!/usr/bin/env node
/**
 * probe-ai-providers.js — Pirâmide passo 1 (docs/RULES.md, Regra 5).
 *
 * Chama a API REAL dos providers de IA das notícias (Groq → Gemini) e
 * imprime status HTTP, modelo, erro (se houver) e preview da resposta.
 * Também chama o askAINews() real (fallback incluso) com o prompt real.
 *
 * Rodar no VPS, da raiz do projeto (precisa do .env + dist buildado):
 *   cd ~/bot-wpp && node laboratorio/probe-ai-providers.js
 *
 * Usar SEMPRE antes de: E2E no grupo, troca de modelo/provider, deploy de
 * feature que fala com IA. Pega 404/401/429 em segundos — sem mensagem no
 * grupo, sem deploy.
 */
require('dotenv').config();
const axios = require('axios');

// Manter em sincronia com NEWS_PROVIDERS (src/services/aiService.ts):
const PROVIDERS = [
  { name: 'groq', url: 'https://api.groq.com/openai/v1/chat/completions', keyEnv: 'GROQ_API_KEY', model: 'qwen/qwen3.8-27b' },
  { name: 'gemini', url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', keyEnv: 'GEMINI_API_KEY', model: 'gemini-3.8-flash' },
];

async function probeRaw(p) {
  const key = process.env[p.keyEnv];
  if (!key) return console.log(`✗ ${p.name}: key ausente (${p.keyEnv})`);
  try {
    const res = await axios.post(p.url, {
      model: p.model,
      messages: [{ role: 'user', content: 'responda apenas: ok' }],
      max_tokens: 20,
    }, { headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, timeout: 20000 });
    const content = res.data?.choices?.[0]?.message?.content ?? '';
    console.log(`✓ ${p.name}: HTTP 200 · modelo=${p.model} · content=${JSON.stringify(String(content).slice(0, 40))}`);
  } catch (e) {
    const status = e?.response?.status ?? 'sem status';
    const body = JSON.stringify(e?.response?.data ?? e?.message).slice(0, 220);
    console.log(`✗ ${p.name}: HTTP ${status} · modelo=${p.model} · ${body}`);
  }
}

(async () => {
  console.log('== Probe direto por provider (pirâmide passo 1) ==');
  for (const p of PROVIDERS) await probeRaw(p);

  console.log('\n== askAINews() real com o prompt real de notícias ==');
  try {
    const { askAINews } = require('../dist/services/aiService.js');
    const { buildNewsPrompt } = require('../dist/services/newsService.js');
    const out = await askAINews(buildNewsPrompt('tecnologia', 3));
    console.log(`✓ askAINews OK · ${out.length} chars · preview: ${JSON.stringify(out.slice(0, 120))}`);
    process.exit(0);
  } catch (e) {
    console.log(`✗ askAINews FALHOU: ${e.message}`);
    process.exit(1);
  }
})();
