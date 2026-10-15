/**
 * 🛡️ SERVIÇO DE VALIDAÇÃO DE NÚMEROS
 * 
 * Implementa validação com getNumberId() para evitar erro "No LID for user"
 */

import logger from './loggerService';

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
        const cleanNumber = phoneNumber.replace('@c.us', '').replace('@g.us', '');

        const numberId = await client.getNumberId!(cleanNumber);

        if (!numberId) {
            return {
                valid: false,
                error: 'No LID for user',
                phoneNumber,
                cleanNumber
            };
        }

        return {
            valid: true,
            numberId,
            phoneNumber,
            cleanNumber,
            serialized: numberId.serialized
        };

    } catch (error: any) {
        logger.error('[VALIDATE] Erro ao validar número', { phoneNumber, error: error.message });
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
        logger.warn('[SEND] Número inválido - não tentando enviar', { phoneNumber, error: validation.error });
        throw new Error(`Número inválido: ${phoneNumber} (${validation.error})`);
    }
    
    // Se válido, enviar mensagem
    try {
        const targetChatId = validation.serialized;
        logger.info('[SEND] Enviando mensagem', { targetChatId });
        
        const result = await client.sendMessage(targetChatId, message);
        
        logger.info('[SEND] Mensagem enviada com sucesso', {
            messageId: result.id?.id || 'unknown',
            to: targetChatId
        });
        
        return {
            success: true,
            result,
            validation
        };
        
    } catch (error: any) {
        logger.error('[SEND] Erro ao enviar mensagem', {
            to: validation.serialized,
            error: error.message
        });
        throw error;
    }
};

export {
    validateNumber,
    validateAndSendMessage
};
