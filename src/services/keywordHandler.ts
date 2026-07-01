import { getSarcasticResponse } from './aiService';

/**
 * Processa mensagens em busca de palavras-chave ou tentativas de trollagem
 * @param msg - Objeto de mensagem do WWebJS
 * @param client - Instância do bot
 * @returns Retorna true se processou algo que deve interromper o fluxo
 */
async function handleKeywords(msg: any, client: any): Promise<boolean> {
    const body = msg.body.toLowerCase();

    // 1. Detecção de Trollagem (Falso Banimento/Saída)
    const trollPatterns = [
        "removeu você",
        "saiu do grupo",
        "adicionou você",
        "foi banido"
    ];

    if (trollPatterns.some(pattern => body.includes(pattern))) {
        // Verificar se é uma mensagem do sistema ou apenas texto
        // Mensagens reais do sistema geralmente não têm body de texto plano dessa forma
        // Mas se alguém escreve isso manualmente, é troll
        await msg.delete(true);
        await msg.reply("Tentativa de zoeira detectada. Hoje não, amigão. 😂");
        console.log(`🛡️ [MODERATION] Troll detectado de ${msg.author || msg.from}: ${body}`);
        return true;
    }

    // 2. Trigger Sarcástico para "bot" (apenas se a palavra estiver isolada ou for o foco)
    const isCommand = msg.body.startsWith('$');
    const botMention = /\bbot\b/i.test(body);
    if (botMention && !isCommand && body.length < 20) {
        await msg.reply(getSarcasticResponse());
        return true;
    }

    return false;
}

export {
    handleKeywords
};
