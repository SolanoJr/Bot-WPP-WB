import { validateNumber } from './validationService';

interface Context {
    message: any;
    client?: any;
}

const sendText = async (context: Context, text: string): Promise<any> => {
    if (!context?.message || typeof context.message.reply !== 'function') {
        throw new Error('Contexto de resposta invalido.');
    }

    const startTime = Date.now();
    const chatId = context.message.from;
    const textPreview = text.substring(0, 50) + (text.length > 50 ? '...' : '');
    
    console.log(`📤 Enviando mensagem para ${chatId?.substring(0, 20)}...: "${textPreview}"`);
    
    try {
        // Validar número antes de enviar (se tiver client no contexto)
        if (context.client) {
            const validation = await validateNumber(context.client, chatId);
            if (!validation.valid) {
                console.log(`🚫 Número inválido detectado: ${chatId} (${validation.error})`);
                throw new Error(`Número inválido: ${chatId} (${validation.error})`);
            }
        }
        
        const result = await context.message.reply(text);
        const duration = Date.now() - startTime;
        
        console.log(`✅ Mensagem enviada com sucesso para ${chatId?.substring(0, 20)}... (${duration}ms):`, {
            messageId: result.id?.id || 'unknown',
            fromMe: result.fromMe || false,
            remote: result.remote || 'unknown'
        });
        
        return result;
        
    } catch (error: any) {
        const duration = Date.now() - startTime;
        console.error(`❌ Erro ao enviar mensagem para ${chatId?.substring(0, 20)}... (${duration}ms):`, {
            error: error.message,
            code: error.code,
            textPreview
        });
        
        throw error;
    }
};

const sendError = async (context: Context, text: string = 'Erro ao executar comando'): Promise<any> => {
    return sendText(context, text);
};

export {
    sendError,
    sendText
};
