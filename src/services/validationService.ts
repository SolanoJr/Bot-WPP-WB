/**
 * 🛡️ SERVIÇO DE VALIDAÇÃO DE NÚMEROS
 * 
 * Implementa validação com getNumberId() para evitar erro "No LID for user"
 */

interface ValidationResult {
    valid: boolean;
    error?: string;
    phoneNumber?: string;
    cleanNumber?: string;
    numberId?: any;
    serialized?: string;
}

interface SendMessageResult {
    success: boolean;
    result?: any;
    validation?: ValidationResult;
}

const validateNumber = async (client: any, phoneNumber: string): Promise<ValidationResult> => {
    try {
        console.log(`🔍 [VALIDATE] Validando número: ${phoneNumber}`);
        
        // Remover sufixos e formatar
        const cleanNumber = phoneNumber.replace('@c.us', '').replace('@g.us', '');
        
        // Verificar se o número existe no WhatsApp
        const numberId = await client.getNumberId(cleanNumber);
        
        if (!numberId) {
            console.log(`❌ [VALIDATE] NÃO EXISTE: ${phoneNumber}`);
            return {
                valid: false,
                error: 'No LID for user',
                phoneNumber,
                cleanNumber
            };
        }
        
        console.log(`✅ [VALIDATE] VÁLIDO: ${phoneNumber} -> ${numberId._serialized}`);
        return {
            valid: true,
            numberId,
            phoneNumber,
            cleanNumber,
            serialized: numberId._serialized
        };
        
    } catch (error: any) {
        console.error(`❌ [VALIDATE] Erro ao validar ${phoneNumber}:`, error.message);
        return {
            valid: false,
            error: error.message,
            phoneNumber
        };
    }
};

const validateAndSendMessage = async (client: any, phoneNumber: string, message: string): Promise<SendMessageResult> => {
    // Primeiro validar o número
    const validation = await validateNumber(client, phoneNumber);
    
    if (!validation.valid) {
        console.log(`🚫 [SEND] Número inválido - NÃO tentando enviar`);
        throw new Error(`Número inválido: ${phoneNumber} (${validation.error})`);
    }
    
    // Se válido, enviar mensagem
    try {
        const targetChatId = validation.serialized;
        console.log(`📤 [SEND] Enviando para ${targetChatId}`);
        
        const result = await client.sendMessage(targetChatId, message);
        
        console.log(`✅ [SEND] Mensagem enviada com sucesso!`);
        console.log(`📊 [SEND] MessageID: ${result.id?.id || 'unknown'}`);
        console.log(`📊 [SEND] Para: ${targetChatId}`);
        
        return {
            success: true,
            result,
            validation
        };
        
    } catch (error: any) {
        console.error(`❌ [SEND] Erro ao enviar para ${validation.serialized}:`, error.message);
        throw error;
    }
};

export {
    validateNumber,
    validateAndSendMessage
};
