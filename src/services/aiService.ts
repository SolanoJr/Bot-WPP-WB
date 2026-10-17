import axios from 'axios';
import { getDb } from './databaseService';
import { logInfo, logWarning, logError } from './loggerService';
import { circuitBreakerManager } from './circuitBreaker';
import { retryApiCall } from './retryWithBackoff';

/**
 * Envia uma pergunta para a IA do Gemini com suporte a memória de contexto
 * @param prompt - Pergunta do usuário
 * @param userId - ID do usuário para recuperar contexto
 * @returns Resposta da IA
 */
async function askAI(prompt: string, userId: string = 'unknown'): Promise<string> {
    // Lazy read: o dotenv.config() roda no entry point, mas os imports são hoisted.
    // Ler aqui garante que process.env já foi populado em runtime.
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!GEMINI_API_KEY) {
        logWarning('❌ Erro: Chave da API (GEMINI_API_KEY ou GOOGLE_API_KEY) não encontrada.');
        return "⚠️ Erro: API_KEY não configurada. Verifique o arquivo .env.";
    }

    try {
        // 1. Recuperar contexto do banco de dados (últimas 5 mensagens)
        let context = "";
        const db = await getDb();
        const history = await db.all(
            'SELECT prompt, response FROM ai_history WHERE user_id = ? ORDER BY timestamp DESC LIMIT 5',
            [userId]
        );

        if (history.length > 0) {
            context = history.reverse().map((h: any) => `Usuário: ${h.prompt}\nIA: ${h.response}`).join('\n\n');
        }

        // Usando gemini-2.5-flash (gemini-1.5-flash foi descontinuado - retorna 404).
        const model = "gemini-2.5-flash";
        // Usando v1beta para modelos flash mais novos
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

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

        // Circuit Breaker + Retry wrapper
        const breaker = circuitBreakerManager.get('gemini-api', {
            failureThreshold: 3,
            successThreshold: 2,
            timeout: 90000,
            resetTimeout: 60000,
            // 4xx não-recuperável (prompt inválido, key errada) não é falha de
            // disponibilidade do provider — não deve abrir o circuito.
            shouldCountFailure: (err: any) => {
                const s = err?.response?.status;
                return !(s && s >= 400 && s < 500 && s !== 429);
            }
        });

        const response = await breaker.execute(async () =>
            await retryApiCall(async () => await axios.post(url, {
                contents: [
                    {
                        parts: [{ text: `${systemInstruction}\n\nPergunta atual: ${prompt}` }]
                    }
                ],
                generationConfig: {
                    temperature: 0.7,
                    topK: 40,
                    topP: 0.95,
                    maxOutputTokens: 1024,
                }
            }, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 15000
            }))
        );

        if (response.data && response.data.candidates && response.data.candidates[0].content && response.data.candidates[0].content.parts) {
            const aiResponse = response.data.candidates[0].content.parts[0].text;

            // 2. Salvar a interação no banco de dados para memória futura
            await db.run(
                'INSERT INTO ai_history (user_id, prompt, response) VALUES (?, ?, ?)',
                [userId, prompt, aiResponse]
            );

            return aiResponse;
        }

        logError('⚠️ Resposta inesperada da API Gemini:', JSON.stringify(response.data, null, 2));
        return "🤖 A IA recebeu a mensagem, mas não gerou uma resposta válida.";
    } catch (error: any) {
        if (error.response) {
            const errorData = error.response.data;
            const status = error.response.status;
            logError(`❌ Erro na API do Gemini (Status ${status}):`, JSON.stringify(errorData, null, 2));

            if (status === 429 || (errorData.error && errorData.error.code === 429)) {
                const isQuotaExceeded = errorData.error?.message?.toLowerCase().includes('quota exceeded');
                if (isQuotaExceeded) {
                    return "🤖 Minha cota diária de inteligência para este modelo (Gemini 2.5 Flash) acabou. Volto a responder amanhã ou quando a cota resetar!";
                }
                return "🤖 Estou processando muitas informações no momento. Aguarde uns segundos e tente novamente!";
            }

            if (status === 400) {
                return "⚠️ Erro na requisição (400). Isso pode ser devido ao tamanho do contexto ou formato do prompt.";
            }

            if (status === 403) {
                return "🚫 Erro de permissão (403). Verifique se sua API Key é válida e tem permissão para o modelo selecionado.";
            }
        } else {
            logError('❌ Erro na comunicação com Gemini:', error.message);
        }
        return "⚠️ Desculpe, ocorreu um erro ao processar sua pergunta na IA.";
    }
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

/** Provider de chat compatível com OpenAI (POST {url}, Authorization Bearer). */
interface NewsProvider {
    name: string;
    url: string;
    keyEnv: string;
    model: string;
}

/**
 * Ordem = prioridade: Groq primeiro, Gemini como fallback.
 * O Gemini entra pelo endpoint OpenAI-compat oficial (mesma GEMINI_API_KEY e
 * mesmo modelo do askAI) porque a URL nativa (:generateContent, payload
 * contents/generationConfig) não serve neste loop chat/completions.
 */
const NEWS_PROVIDERS: NewsProvider[] = [
    {
        name: 'groq',
        url: 'https://api.groq.com/openai/v1/chat/completions',
        keyEnv: 'GROQ_API_KEY',
        model: 'llama-3.3-70b-versatile',
    },
    {
        name: 'gemini',
        url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
        keyEnv: 'GEMINI_API_KEY',
        model: 'gemini-2.5-flash',
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
