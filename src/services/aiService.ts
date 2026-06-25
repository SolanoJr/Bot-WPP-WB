import axios from 'axios';
require('dotenv').config();
import { getDb } from './databaseService'; // Caminho corrigido para o mesmo diretório

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

/**
 * Envia uma pergunta para a IA do Gemini com suporte a memória de contexto
 * @param prompt - Pergunta do usuário
 * @param userId - ID do usuário para recuperar contexto
 * @returns Resposta da IA
 */
async function askAI(prompt: string, userId: string = 'unknown'): Promise<string> {
    if (!GEMINI_API_KEY) {
        console.error('❌ Erro: Chave da API (GEMINI_API_KEY ou GOOGLE_API_KEY) não encontrada.');
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

        // Migrado para gemini-1.5-flash para maior estabilidade de cota (1500 req/dia vs 20 req/dia do 2.5).
        const model = "gemini-1.5-flash";
        // Usando v1beta para suporte total ao modelo 1.5-flash
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

        const response = await axios.post(url, {
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
        });

        if (response.data && response.data.candidates && response.data.candidates[0].content && response.data.candidates[0].content.parts) {
            const aiResponse = response.data.candidates[0].content.parts[0].text;

            // 2. Salvar a interação no banco de dados para memória futura
            await db.run(
                'INSERT INTO ai_history (user_id, prompt, response) VALUES (?, ?, ?)',
                [userId, prompt, aiResponse]
            );

            return aiResponse;
        }

        console.error('⚠️ Resposta inesperada da API Gemini:', JSON.stringify(response.data, null, 2));
        return "🤖 A IA recebeu a mensagem, mas não gerou uma resposta válida.";
    } catch (error: any) {
        if (error.response) {
            const errorData = error.response.data;
            const status = error.response.status;
            console.error(`❌ Erro na API do Gemini (Status ${status}):`, JSON.stringify(errorData, null, 2));

            if (status === 429 || (errorData.error && errorData.error.code === 429)) {
                const isQuotaExceeded = errorData.error?.message?.toLowerCase().includes('quota exceeded');
                if (isQuotaExceeded) {
                    return "🤖 Minha cota diária de inteligência acabou. Volto a responder amanhã ou quando a cota resetar!";
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
            console.error('❌ Erro na comunicação com Gemini:', error.message);
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
        "Tenho nada a ver com isso.",
        "Eu sou apenas um bot, por que me envolve nisso?",
        "Sei de nada, sou inocente.",
        "Não fui eu, foi o código.",
        "Isso soa como um problema de humano, não meu."
    ];
    return responses[Math.floor(Math.random() * responses.length)];
}

export {
    askAI,
    getSarcasticResponse
};
