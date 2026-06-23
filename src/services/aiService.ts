import axios from 'axios';
require('dotenv').config();
import { getDb } from './databaseService'; // Caminho corrigido para o mesmo diretório

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

/**
 * Envia uma pergunta para a IA do Gemini com suporte a memória de contexto
 * @param prompt - Pergunta do usuário
 * @param userId - ID do usuário para recuperar contexto
 * @returns Resposta da IA
 */
async function askAI(prompt: string, userId: string = 'unknown'): Promise<string> {
    if (!GEMINI_API_KEY) {
        return "⚠️ Erro: GEMINI_API_KEY não configurada. Configure a chave no .env para usar a IA.";
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

        // Use the Gemini Pro model via the stable v1 endpoint.
        // The previous v1beta endpoint returned NOT_FOUND for gemini-pro.
        const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
        
        // Personalidade: Estratégico, inteligente, levemente sarcástico e direto.
        const systemPrompt = `Você é o Bot-WPP, um assistente ultra-inteligente, estratégico e direto. 
        Sua personalidade é profissional, mas com um toque de sarcasmo inteligente. 
        Evite respostas infantis ou excessivamente longas. 
        Seja útil, mas mantenha sua postura de "superioridade tecnológica".
        
        Contexto da conversa anterior:
        ${context}
        \n\n`;

        const fullPrompt = systemPrompt + `Pergunta atual: ${prompt}`;

        const response = await axios.post(url, {
            contents: [{
                parts: [{ text: fullPrompt }]
            }]
        }, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000
        });

        if (response.data && response.data.candidates && response.data.candidates[0].content) {
            const aiResponse = response.data.candidates[0].content.parts[0].text;
            
            // 2. Salvar a interação no banco de dados para memória futura
            await db.run(
                'INSERT INTO ai_history (user_id, prompt, response) VALUES (?, ?, ?)',
                [userId, prompt, aiResponse]
            );

            return aiResponse;
        }

        return "🤖 A IA não soube responder no momento.";
    } catch (error: any) {
        if (error.response) {
            console.error('❌ Erro na API do Gemini (Resposta Completa):', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error('❌ Erro na API do Gemini:', error.message);
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
