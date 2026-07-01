/**
 * 📋 SERVIÇO DE FILA DE MENSAGENS
 * 
 * Implementa sistema de fila persistente com:
 * - Criação de .pending-messages.json
 * - Leitura e processamento
 * - Apagamento seguro
 * - Logs por mensagem com ID único
 * - Prevenção de duplicatas
 */

import fs from 'fs';
import path from 'path';

const QUEUE_FILE = path.join(__dirname, '..', '.pending-messages.json');

interface MessageData {
    id: string;
    chatId: string;
    message: string;
    metadata: any;
    timestamp: string;
    status: 'queued' | 'sent' | 'failed';
    retryCount: number;
    processedAt: string | null;
    completedAt: string | null;
    error: string | null;
    result?: any;
}

interface EnqueueResult {
    success: boolean;
    messageId?: string;
    queueSize?: number;
    error?: string;
    existingId?: string;
}

interface QueueStats {
    total: number;
    queued: number;
    sent: number;
    failed: number;
    oldestMessage: string | null;
    newestMessage: string | null;
}

// Garante que o arquivo da fila exista
const ensureQueueFile = (): boolean => {
    if (!fs.existsSync(QUEUE_FILE)) {
        console.log(`📁 [QUEUE] Criando arquivo da fila: ${QUEUE_FILE}`);
        fs.writeFileSync(QUEUE_FILE, JSON.stringify([]), 'utf8');
        return true;
    }
    return false;
};

// Gerar ID único para mensagem
const generateMessageId = (): string => {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// Enfileirar mensagem
const enqueueMessage = (chatId: string, message: string, metadata: any = {}): EnqueueResult => {
    ensureQueueFile();
    
    try {
        const queue: MessageData[] = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8'));
        
        // Verificar duplicatas
        const duplicate = queue.find(item => 
            item.chatId === chatId && 
            item.message === message && 
            item.status === 'queued'
        );
        
        if (duplicate) {
            console.log(`⚠️  [QUEUE] Mensagem duplicada detectada - ignorando`);
            return {
                success: false,
                error: 'duplicate_message',
                existingId: duplicate.id
            };
        }
        
        const messageData: MessageData = {
            id: generateMessageId(),
            chatId,
            message,
            metadata,
            timestamp: new Date().toISOString(),
            status: 'queued',
            retryCount: 0,
            processedAt: null,
            completedAt: null,
            error: null
        };
        
        queue.push(messageData);
        fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2), 'utf8');
        
        console.log(`📥 [QUEUE] Mensagem enfileirada: ${messageData.id}`);
        console.log(`📊 [QUEUE] Tamanho da fila: ${queue.length}`);
        
        return {
            success: true,
            messageId: messageData.id,
            queueSize: queue.length
        };
        
    } catch (error: any) {
        console.error(`❌ [QUEUE] Erro ao enfileirar mensagem:`, error.message);
        return {
            success: false,
            error: error.message
        };
    }
};

// Ler próxima mensagem da fila
const getNextMessage = (): MessageData | null => {
    ensureQueueFile();
    
    try {
        const queue: MessageData[] = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8'));
        const nextMessage = queue.find(item => item.status === 'queued');
        
        if (!nextMessage) {
            return null;
        }
        
        console.log(`📤 [QUEUE] Próxima mensagem: ${nextMessage.id}`);
        return nextMessage;
        
    } catch (error: any) {
        console.error(`❌ [QUEUE] Erro ao ler próxima mensagem:`, error.message);
        return null;
    }
};

// Marcar mensagem como processada
const markAsProcessed = (messageId: string, result: any = null): boolean => {
    ensureQueueFile();
    
    try {
        const queue: MessageData[] = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8'));
        const messageIndex = queue.findIndex(item => item.id === messageId);
        
        if (messageIndex === -1) {
            console.log(`⚠️  [QUEUE] Mensagem ${messageId} não encontrada`);
            return false;
        }
        
        queue[messageIndex].status = result ? 'sent' : 'failed';
        queue[messageIndex].processedAt = new Date().toISOString();
        queue[messageIndex].result = result;
        
        if (result) {
            queue[messageIndex].completedAt = new Date().toISOString();
        }
        
        fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2), 'utf8');
        
        console.log(`✅ [QUEUE] Mensagem ${messageId} marcada como ${queue[messageIndex].status}`);
        return true;
        
    } catch (error: any) {
        console.error(`❌ [QUEUE] Erro ao marcar mensagem como processada:`, error.message);
        return false;
    }
};

// Remover mensagens antigas (manutenção)
const cleanupOldMessages = (olderThanHours: number = 24): number => {
    ensureQueueFile();
    
    try {
        const queue: MessageData[] = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8'));
        const cutoffTime = new Date(Date.now() - (olderThanHours * 60 * 60 * 1000));
        
        const originalSize = queue.length;
        const filteredQueue = queue.filter(item => {
            const itemTime = new Date(item.timestamp);
            return itemTime > cutoffTime || item.status === 'queued';
        });
        
        if (filteredQueue.length !== originalSize) {
            fs.writeFileSync(QUEUE_FILE, JSON.stringify(filteredQueue, null, 2), 'utf8');
            console.log(`🧹 [QUEUE] Limpeza: ${originalSize - filteredQueue.length} mensagens antigas removidas`);
        }
        
        return filteredQueue.length;
        
    } catch (error: any) {
        console.error(`❌ [QUEUE] Erro na limpeza:`, error.message);
        return -1;
    }
};

// Obter estatísticas da fila
const getQueueStats = (): QueueStats | null => {
    ensureQueueFile();
    
    try {
        const queue: MessageData[] = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8'));
        
        const stats: QueueStats = {
            total: queue.length,
            queued: queue.filter(item => item.status === 'queued').length,
            sent: queue.filter(item => item.status === 'sent').length,
            failed: queue.filter(item => item.status === 'failed').length,
            oldestMessage: queue.length > 0 ? queue[0].timestamp : null,
            newestMessage: queue.length > 0 ? queue[queue.length - 1].timestamp : null
        };
        
        return stats;
        
    } catch (error: any) {
        console.error(`❌ [QUEUE] Erro ao obter estatísticas:`, error.message);
        return null;
    }
};

// Log detalhado por mensagem
const logMessageDetails = (messageId: string, details: any): void => {
    const logEntry = {
        messageId,
        timestamp: new Date().toISOString(),
        ...details
    };
    
    const logFile = path.join(__dirname, '..', 'logs', 'queue-detailed.log');
    fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n', 'utf8');
    
    console.log(`📝 [QUEUE] Log detalhado para ${messageId}`);
};

export {
    enqueueMessage,
    getNextMessage,
    markAsProcessed,
    cleanupOldMessages,
    getQueueStats,
    logMessageDetails,
    ensureQueueFile
};
