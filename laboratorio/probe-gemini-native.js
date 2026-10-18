#!/usr/bin/env node
/**
 * probe-gemini-native.js — INC-002 (docs/RULES.md, Regra 5): probe DIRETO do
 * endpoint NATIVO do Gemini — o que o askAI usa em src/services/aiService.ts.
 *
 * Rodar no VPS (a GEMINI_API_KEY está no .env de lá):
 *   cd ~/bot-wpp && node laboratorio/probe-gemini-native.js
 * Nunca imprime valor de key.
 *
 * O que decide:
 *   (1) lista de modelos gemini*flash* disponíveis na conta;
 *   (2) POST :generateContent nativo nos candidatos — 2.5 morto? 3.8 vivo?
 *       content vem preenchido?
 *   (3) 3.8 + thinkingConfig.thinkingBudget=0 — se reasoning-first comer o
 *       content no (2), desligar thinking resolve?
 * Evidência extra: o parser do askAI lê EXATAMENTE candidates[0].content.
 * parts[0].text — a coluna "parts[0].text" mostra se o primeiro part é texto.
 * Se não for, o askAI quebra mesmo com resposta 200.
 */
const path = require('path');
const axios = require('axios');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
if (!KEY) {
  console.error('PARE: GEMINI_API_KEY ausente no .env (e GOOGLE_API_KEY também).');
  process.exit(1);
}
const BASE = 'https://generativelanguage.googleapis.com/v1beta';
const AX = { headers: { 'Content-Type': 'application/json' }, timeout: 30000, validateStatus: () => true };

function ms(t0) { return `${Date.now() - t0}ms`; }

async function listModels() {
  const t0 = Date.now();
  const r = await axios.get(`${BASE}/models?key=${KEY}`, AX);
  if (r.status !== 200) {
    console.log(`(1) LIST models → HTTP ${r.status} (${ms(t0)}) — ${String(r.data?.error?.message || '').slice(0, 200)}`);
    return [];
  }
  const ids = (r.data.models || []).map((m) => m.name.replace(/^models\//, ''));
  const flash = ids.filter((id) => id.includes('gemini') && id.includes('flash'));
  console.log(`(1) LIST models → HTTP 200 (${ms(t0)}) — ${ids.length} modelos, ${flash.length} gemini*flash*:`);
  flash.forEach((id) => console.log(`    ${id}`));
  return flash;
}

async function probeNative(model, genCfg, label, attempts = 4) {
  const body = {
    contents: [{ role: 'user', parts: [{ text: 'responda apenas: ok' }] }],
    generationConfig: genCfg,
  };
  for (let i = 1; i <= attempts; i++) {
    const t0 = Date.now();
    try {
      const r = await axios.post(`${BASE}/models/${model}:generateContent?key=${KEY}`, body, AX);
      const lat = ms(t0);
      // 503 (spike de demanda) e 429 são transitórios — retry com backoff
      if ((r.status === 503 || r.status === 429) && i < attempts) {
        console.log(`${label.padEnd(42)} HTTP ${r.status} (tentativa ${i}/${attempts}, ${lat}) — retry em 8s`);
        await new Promise((res) => setTimeout(res, 8000));
        continue;
      }
      if (r.status !== 200) {
        const msg = r.data?.error?.message || '';
        console.log(`${label.padEnd(42)} HTTP ${r.status}  ${lat}  msg=${String(msg).slice(0, 140)}`);
        return { status: r.status, content: false, parts0Text: false };
      }
    const c = r.data.candidates?.[0];
    const parts = c?.content?.parts || [];
    const anyText = parts.some((p) => p.text && p.text.trim());
    const p0 = parts[0]?.text;
    const um = r.data.usageMetadata || {};
    console.log(
      `${label.padEnd(42)} HTTP 200  ${lat}  content=${anyText ? 'SIM' : 'VAZIO'}` +
      `  parts[0].text=${p0 && p0.trim() ? 'SIM' : 'NÃO'}  finish=${c?.finishReason || '-'}` +
      `  tokens(out/thought)=${um.candidatesTokenCount ?? '-'}/${um.thoughtsTokenCount ?? '-'}  parts=${parts.length}`
    );
    if (anyText) {
      const t = parts.map((p) => p.text || '').join('').trim();
      console.log(`    texto="${t.slice(0, 80)}"`);
    }
    return { status: 200, content: anyText, parts0Text: !!(p0 && p0.trim()) };
  } catch (e) {
    console.log(`${label.padEnd(42)} ERRO-REDE ${ms(t0)}  ${e.code || e.message}`);
    return { status: 0, content: false, parts0Text: false };
  }
  }
  return { status: 0, content: false, parts0Text: false }; // for esgotou em 503/429
}

(async () => {
  console.log('═══ (1) lista de modelos ═══');
  const flash = await listModels();

  console.log('\n═══ (2) POST nativo :generateContent (maxOutputTokens=30) ═══');
  await probeNative('gemini-2.5-flash', { maxOutputTokens: 30, temperature: 0.2 }, 'gemini-2.5-flash');
  await probeNative('gemini-3.8-flash', { maxOutputTokens: 30, temperature: 0.2 }, 'gemini-3.8-flash');
  await probeNative('gemini-flash-latest', { maxOutputTokens: 30, temperature: 0.2 }, 'gemini-flash-latest');
  await probeNative('gemini-3.5-flash', { maxOutputTokens: 30, temperature: 0.2 }, 'gemini-3.5-flash');
  const lite =
    flash.find((id) => /gemini-3[\d.]*-flash-lite$/.test(id)) ||
    flash.find((id) => /gemini-\d[\d.]*-flash-lite/.test(id));
  if (lite) await probeNative(lite, { maxOutputTokens: 30, temperature: 0.2 }, `${lite} (lite)`);
  else console.log('(sem variante -lite na lista desta conta)');

  console.log('\n═══ (3) + thinkingBudget=0 (maxOutputTokens=200) ═══');
  await probeNative(
    'gemini-3.8-flash',
    { maxOutputTokens: 200, temperature: 0.2, thinkingConfig: { thinkingBudget: 0 } },
    'gemini-3.8-flash +thinkingBudget=0'
  );
  await probeNative(
    'gemini-flash-latest',
    { maxOutputTokens: 200, temperature: 0.2, thinkingConfig: { thinkingBudget: 0 } },
    'gemini-flash-latest +thinkingBudget=0'
  );
})();
