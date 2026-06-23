const axios = require('axios');
require('dotenv').config();
const { getDb } = require('./databaseService'); // Importando DB para memória

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

/**
 * Envia uma pergunta para a IA do Gemini com suporte a memória de contexto
 * @param {string} prompt - Pergunta do usuário
 * @param {string} userId - ID do usuário para recuperar contexto
 * @returns {Promise<string>} - Resposta da IA
 */
async function askAI(prompt, userId = 'unknown') {
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
            context = history.reverse().map(h => `Usuário: ${h.prompt}\nIA: ${h.response}`).join('\n\n');
        }

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GEMINI_API_KEY}`;
        
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
    } catch (error) {
        if (error.response) {
            console.error('❌ Erro na API do Gemini (Resposta Completa):', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error('❌ Erro na API do Gemini:', error.message);
        }
        // Fallback: resposta sarcástica para evitar erro silencioso
        return getSarcasticResponse();
    }
}

/**
 * Gera uma resposta sarcástica baseada no contexto
 * @returns {string}
 */
function getSarcasticResponse() {
    const responses = [
        "Tenho nada a ver com isso.",
        "Eu sou apenas um bot, por que me envolve nisso?",
        "Sei de nada, sou inocente.",
        "Não fui eu, foi o código.",
        "Isso soa como um problema de humano, não meu."
    ];
    return responses[Math.floor(Math.random() * responses.length)];
}

module.exports = {
    askAI,
    getSarcasticResponse
};
