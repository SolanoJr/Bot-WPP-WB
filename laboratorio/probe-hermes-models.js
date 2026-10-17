#!/usr/bin/env node
/**
 * probe-hermes-models.js — Pirâmide passo 1 (docs/RULES.md, Regra 5)
 * aplicado à config do Hermes: 1 chamada curta por modelo, 2x cada,
 * latência real medida. Nunca imprime valor de key.
 *
 * Rodar LOCALMENTE (Windows), da raiz do projeto — as keys do Hermes
 * estão em %LOCALAPPDATA%/hermes/.env, não no VPS:
 *   cd D:/Downloads/Bot-WPP-WB-main && node laboratorio/probe-hermes-models.js
 *
 * Ordem de carga das keys: hermes/.env (override) -> ./.env -> env do processo.
 * Classificação: 200+c=OK · 200 vazio=VAZIO · 429/503=RATE-LIMIT (não é
 * morto) · 404=MORTO · 401/403=KEY · timeout/rede=ERRO.
 */
const path = require('path');
const fs = require('fs');
const axios = require('axios');

function loadEnv(fp, override) {
  if (fp && fs.existsSync(fp)) require('dotenv').config({ path: fp, override });
}
const hermesEnv = process.env.LOCALAPPDATA
  ? path.join(process.env.LOCALAPPDATA, 'hermes', '.env') : null;
loadEnv(hermesEnv, true); // arquivo do Hermes vence: é o que o Hermes carrega
loadEnv(path.join(__dirname, '..', '.env'), false); // fallback (ex.: no VPS)

const PROVIDERS = {
  nvidia:     { url: 'https://integrate.api.nvidia.com/v1/chat/completions', keyEnv: 'NVIDIA_API_KEY' },
  openrouter: { url: 'https://openrouter.ai/api/v1/chat/completions',         keyEnv: 'OPENROUTER_API_KEY' },
  nous:       { url: process.env.NOUS_BASE_URL || 'https://inference.nousresearch.com/v1/chat/completions', keyEnv: 'NOUS_PORTAL_API_KEY' },
};

// Candidatos do runbook (2026-10-17) + grafia pontuada do glm (alias vivo
// na config é z-ai/glm-5.3 — esta sessão roda nele; probe decide qual existe).
const CANDIDATES = [
  // NVIDIA NIM
  { p: 'nvidia', m: 'z-ai/glm-5-3' },
  { p: 'nvidia', m: 'z-ai/glm-5.3' },
  { p: 'nvidia', m: 'z-ai/glm-5-3-flash' },
  { p: 'nvidia', m: 'z-ai/glm-5.3-flash' },
  { p: 'nvidia', m: 'openai/gpt-oss-120b' },
  { p: 'nvidia', m: 'meta/llama-3.3-70b-instruct' },
  { p: 'nvidia', m: 'nvidia/llama-3.3-nemotron-super-49b-v1' },
  { p: 'nvidia', m: 'google/gemma-4-31b-it' },
  // OpenRouter
  { p: 'openrouter', m: 'nvidia/nemotron-3-ultra-550b-a55b:free' },
  { p: 'openrouter', m: 'poolside/laguna-s-2.1:free' },
  { p: 'openrouter', m: 'thinkingmachines/inkling-small:free' },
  { p: 'openrouter', m: 'google/gemma-4-31b-it:free' },
  { p: 'openrouter', m: 'qwen/qwen3.8-27b:free' },
  // Nous Portal (só se NOUS_PORTAL_API_KEY existir)
  { p: 'nous', m: 'meituan/longcat-2.5-preview:free' },
  { p: 'nous', m: 'upstage/solar-mini4:free' },
];

async function callOnce(p, model) {
  const key = process.env[p.keyEnv];
  if (!key) return { skipped: true, note: `key ausente (${p.keyEnv})` };
  const t0 = Date.now();
  try {
    const res = await axios.post(p.url, {
      model,
      messages: [{ role: 'user', content: 'responda apenas: ok' }],
      max_tokens: 20,
    }, {
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      timeout: 20000,
    });
    const ms = Date.now() - t0;
    const content = res.data?.choices?.[0]?.message?.content ?? '';
    return { ms, status: res.status, content: String(content) };
  } catch (e) {
    const ms = Date.now() - t0;
    const status = e?.response?.status ?? (e?.code === 'ECONNABORTED' ? 'timeout' : 'rede');
    const body = JSON.stringify(e?.response?.data ?? e?.message ?? '').slice(0, 180);
    return { ms, status, error: body };
  }
}

function classify(c) {
  if (c.skipped) return 'PULADO';
  if (c.status === 200) return String(c.content || '').trim() ? 'OK' : 'VAZIO(200)';
  if (c.status === 429 || c.status === 503) return 'RATE-LIMIT';
  if (c.status === 404) return 'MORTO(404)';
  if (c.status === 401 || c.status === 403) return `KEY(${c.status})`;
  return `ERRO(${c.status})`;
}

function fmt(c) {
  if (c.skipped) return c.note;
  const tail = c.error ? ` · ${c.error}` : (c.content !== undefined ? ` · c=${JSON.stringify(String(c.content).slice(0, 30))}` : '');
  return `HTTP ${c.status} · ${c.ms}ms${tail}`;
}

(async () => {
  console.log('== probe-hermes-models · ' + new Date().toISOString() + ' ==');
  const summary = [];
  for (const c of CANDIDATES) {
    const p = PROVIDERS[c.p];
    const r1 = await callOnce(p, c.m);
    const r2 = r1.skipped ? r1 : (await new Promise(r => setTimeout(r, 2000)), await callOnce(p, c.m));
    console.log(`${c.p} | ${c.m}`);
    console.log(`   #1 ${fmt(r1)}`);
    if (!r1.skipped) console.log(`   #2 ${fmt(r2)}`);
    const cls1 = classify(r1), cls2 = classify(r2);
    summary.push({ p: c.p, m: c.m, cls1, cls2, ms1: r1.ms ?? '-', ms2: r2.ms ?? '-' });
  }
  console.log('\n== RESUMO (modelo | provider | #1 | #2) ==');
  for (const s of summary) {
    console.log(`${s.m} | ${s.p} | ${s.cls1} ${s.ms1}ms | ${s.cls2} ${s.ms2}ms`);
  }
})();
