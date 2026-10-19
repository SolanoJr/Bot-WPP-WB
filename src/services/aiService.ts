import axios from 'axios';
import { getDb } from './databaseService';
import { logInfo, logWarning, logError } from './loggerService';
import { circuitBreakerManager } from './circuitBreaker';

/**
 * Responde uma pergunta via pipeline multi-provider (Groq → Gemini-compat).
 *
 * INC-002: o gemini-2.5-flash nativo 404 para contas novas; 9bb6ba7 migrou
 * para 3.8 nativo + thinkingBudget 0. Este passo UNIFICA no padrão do
 * askAINews (INC-001): endpoint chat/completions, Groq primário (probe em
 * prod: 567ms vs 19.791ms do gemini-compat — laboratorio/probe-askai-
 * migration.js) e Gemini-compat como fallback de cota.
 *
 * Preserva do v0: memória de contexto (ai_history, últimas 5), personalidade
 * no systemInstruction, gravação da interação, mensagens amigáveis de erro.
 *
 * Diferente do v0: memória é best-effort — banco fora → segue sem contexto
 * com logWarning, o chat não cai (mesmo padrão do dedup de notícias,
 * INC-006). Breaker POR PROVIDER: circuito do Groq aberto → cai direto pro
 * Gemini. 4xx não-recuperável (prompt/key) não conta como falha de
 * disponibilidade (padrão a9b058b); 429 conta. retryApiCall interno removido
 * — o fallback entre providers é o retry real.
 */
async function askAI(prompt: string, userId: string = 'unknown'): Promise<string> {
    // 1. Memória de contexto (últimas 5 interações) — best-effort.
    let context = "";
    let db: any = null;
    try {
        db = await getDb();
        const history = await db.all(
            'SELECT prompt, response FROM ai_history WHERE user_id = ? ORDER BY timestamp DESC LIMIT 5',
            [userId]
        );
        if (history.length > 0) {
            context = history.reverse().map((h: any) => `Usuário: ${h.prompt}\nIA: ${h.response}`).join('\n\n');
        }
    } catch (err: any) {
        logWarning('[askAI] memória indisponível — seguindo sem contexto', { err: String(err?.message || err) });
    }

    const now = new Date();
    const dateTimeStr = now.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

    // Personalidade: Estratégico, inteligente, levemente sarcástico e direto.
    const systemInstruction = `Você é o Bot-WPP, um assistente ultra-inteligente, estratégico e direto.
Sua personalidade é profissional, mas com um toque de sarcasmo inteligente.
Evite respostas infantis ou excessivamente longas.
Seja útil, mas mantenha sua postura de "superioridade tecnológica".

Data/Hora atual: ${dateTimeStr}

Contexto da conversa anterior:
${context}`;

    const errors: { provider: string; status?: number; msg: string }[] = [];
    let quotaHit = false;

    for (const p of ASKAI_PROVIDERS) {
        const key = providerKey(p);
        if (!key) { errors.push({ provider: p.name, msg: 'key ausente' }); continue; }

        // Breaker por provider: askai-groq aberto → cai DIRETO pro gemini.
        const breaker = circuitBreakerManager.get(`askai-${p.name}`, {
            failureThreshold: 3,
            successThreshold: 2,
            timeout: 30000, // gemini-compat pode levar ~20s (probe)
            resetTimeout: 60000,
            shouldCountFailure: (err: any) => {
                const s = err?.response?.status;
                return !(s && s >= 400 && s < 500 && s !== 429);
            }
        });

        try {
            const t0 = Date.now();
            const response = await breaker.execute(async () =>
                await axios.post(p.url, {
                    model: p.model,
                    messages: [
                        { role: 'system', content: systemInstruction },
                        { role: 'user', content: `Pergunta atual: ${prompt}` },
                    ],
                    max_tokens: 800, // Groq free: OTPM limit 1000 — 1024 reprova
                                  // (429 real no E2E 19/10); 800 = padrão do news
                    temperature: 0.7,
                    top_p: 0.95,
                }, {
                    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
                    timeout: 30000,
                })
            );

            const content = (response.data?.choices?.[0]?.message?.content || '').trim();
            if (!content) {
                // 200 sem content = falha disfarçada — cai para o próximo provider.
                throw Object.assign(new Error('resposta vazia'), { isEmpty: true });
            }

            // E2E INC-002: o log precisa mostrar QUEM respondeu e a latência.
            logInfo(`[askAI] provider ${p.name} respondeu em ${Date.now() - t0}ms (${content.length} chars)`);

            // 2. Grava a interação para memória futura — best-effort.
            if (db) {
                try {
                    await db.run(
                        'INSERT INTO ai_history (user_id, prompt, response) VALUES (?, ?, ?)',
                        [userId, prompt, content]
                    );
                } catch (e: any) {
                    logWarning('[askAI] falha ao gravar interação — memória degradada', { err: String(e?.message || e) });
                }
            }
            return content;
        } catch (err: any) {
            const status = err?.response?.status;
            const msg = String(err?.isEmpty
                ? 'resposta vazia (200 sem content)'
                : (err?.response?.data?.error?.message || err?.message || err));
            errors.push({ provider: p.name, status, msg });
            if (status === 429 || /quota/i.test(msg)) quotaHit = true;
            logWarning(`[askAI] provider ${p.name} falhou — tentando próximo`, { status, msg: msg.slice(0, 200) });
        }
    }

    // Todos os providers falharam.
    logError('[askAI] todos os providers falharam', JSON.stringify(errors));
    if (quotaHit) {
        return "🤖 Minha cota diária de inteligência acabou. Volto a responder amanhã ou quando a cota resetar!";
    }
    return "⚠️ Desculpe, ocorreu um erro ao processar sua pergunta na IA.";
}

/**
 * Gera uma resposta sarcástica baseada no contexto
 * @returns
 */
function getSarcasticResponse(): string {
    const responses = [
        "tenho nada ver com isso não sinhô",
        "tenho nada a ver com isso não sinhô, pergunta não.",
        "não foi meu, foi o código sinhô, eu só obedeço.",
        "eu só um bot, não me envolva não sinhô.",
        "isso é contigo não comigo não sinhô."
    ];
    return responses[Math.floor(Math.random() * responses.length)];
}

/**
 * ─── Notícias (askAINews) ───────────────────────────────────────────────
 * Pipeline dedicado às notícias, separado do askAI: sem memória de contexto,
 * sem escrita em ai_history e sem compartilhar o circuit breaker do Gemini —
 * o breaker abrir por rate limit no askAI não pode derrubar as notícias.
 */

/**
 * Provider de chat compatível com OpenAI (POST {url}, Authorization Bearer).
 * Compartilhada pelos pipelines de notícias (askAINews) e de chat (askAI).
 */
interface AiProvider {
    name: string;
    url: string;
    keyEnv: string;
    /** Env alternativa (ex.: GOOGLE_API_KEY como fallback de GEMINI_API_KEY). */
    altKeyEnv?: string;
    model: string;
}

/** Lê a key do provider: env principal, senão a alternativa (askAI histórico). */
function providerKey(p: AiProvider): string | undefined {
    return process.env[p.keyEnv] || (p.altKeyEnv ? process.env[p.altKeyEnv] : undefined);
}

/**
 * Ordem = prioridade: Groq primeiro, Gemini como fallback.
 * O Gemini entra pelo endpoint OpenAI-compat oficial (mesma GEMINI_API_KEY e
 * mesmo modelo do askAI) porque a URL nativa (:generateContent, payload
 * contents/generationConfig) não serve neste loop chat/completions.
 */
const NEWS_PROVIDERS: AiProvider[] = [
    {
        name: 'groq',
        url: 'https://api.groq.com/openai/v1/chat/completions',
        keyEnv: 'GROQ_API_KEY',
        model: 'qwen/qwen3.8-27b',
    },
    {
        name: 'gemini',
        url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
        keyEnv: 'GEMINI_API_KEY',
        model: 'gemini-3.8-flash',
    },
];

/**
 * INC-002 — pipeline do askAI/$pergunta, espelhando o askAINews (INC-001).
 *
 * Groq primário: 567ms medidos em prod vs 19.791ms do gemini-compat
 * (laboratorio/probe-askai-migration.js, keys reais, 19/10). Gemini-compat
 * como fallback de cota — lento, mas mantém o $pergunta vivo quando a
 * cota Groq estourar (compartilhada com as notícias).
 *
 * O endpoint NATIVO do Gemini sai de cena: 9bb6ba7 já provou o 3.8-flash
 * nele (com thinkingBudget 0), mas o chat/completions unifica parser,
 * params e o padrão de fallback com as notícias.
 */
const ASKAI_PROVIDERS: AiProvider[] = [
    {
        name: 'groq',
        url: 'https://api.groq.com/openai/v1/chat/completions',
        keyEnv: 'GROQ_API_KEY',
        model: 'qwen/qwen3.8-27b',
    },
    {
        name: 'gemini',
        url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
        keyEnv: 'GEMINI_API_KEY',
        altKeyEnv: 'GOOGLE_API_KEY',
        model: 'gemini-3.8-flash',
    },
];

/**
 * Busca notícias via IA com fallback entre providers (Groq → Gemini).
 * Só lança quando TODOS falham — o caller decide como reportar ao usuário.
 */
async function askAINews(prompt: string): Promise<string> {
    const errors: string[] = [];
    for (const p of NEWS_PROVIDERS) {
        const key = process.env[p.keyEnv];
        if (!key) { errors.push(`${p.name}: key ausente`); continue; }
        try {
            const res = await axios.post(p.url, {
                model: p.model,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.4,
                max_tokens: 800,
            }, {
                headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
                timeout: 30000,
            });
            const content = res.data?.choices?.[0]?.message?.content;
            if (!content) throw new Error('resposta vazia');
            return content.trim();
        } catch (e: any) {
            errors.push(`${p.name}: ${e.message}`);
        }
    }
    throw new Error(`Todos os providers falharam: ${errors.join(' | ')}`);
}

export {
    askAI,
    askAINews,
    getSarcasticResponse
};
