const loggerService = require('../../services/loggerService');

const SUSPICIOUS_TERMS = [
    'http',
    'https',
    'wa.me',
    't.me',
    'aposta',
    'ganhar dinheiro',
    'lucro fácil',
    'bet',
    'cassino'
];

// Usuários que devem ser bloqueados permanentemente (ex.: spammer)
// Formato completo do WhatsApp ID, ex.: "639474500179@c.us"
const BLOCKED_USERS = new Set<string>([
    // MI500179 (+639474500179)
    '639474500179@c.us'
]);

const seenUsers = new Set<string>();

const normalizeText = (text: any): string => String(text || '').toLowerCase();

const hasSuspiciousLink = (text: string): boolean => {
    return text.includes('http') || text.includes('https') || text.includes('wa.me') || text.includes('t.me');
};

const hasSuspiciousKeyword = (text: string): boolean => {
    return ['aposta', 'ganhar dinheiro', 'lucro fácil', 'bet', 'cassino'].some((keyword) => text.includes(keyword));
};

const resolveUserId = (message: any): string => {
    return message?.author || message?.from || 'usuario-desconhecido';
};

interface AnalysisResult {
    isSpam: boolean;
    reason: string;
}

const analyzeMessage = (message: any = {}): AnalysisResult => {
    // Combine body and caption (if present) for analysis. Captions are used for media messages.
    const rawText = `${message.body || ''} ${message.caption || ''}`;
    const text = normalizeText(rawText);

    if (!text) {
        // No textual content to analyze (e.g., pure sticker without caption)
        return { isSpam: false, reason: '' };
    }

    const userId = resolveUserId(message);
    const isFirstMessage = !seenUsers.has(userId);

    if (isFirstMessage) {
        seenUsers.add(userId);
    }

    // Check for suspicious keywords first
    if (hasSuspiciousKeyword(text)) {
        return {
            isSpam: true,
            reason: 'palavra-chave suspeita detectada'
        };
    }

    // Then check for suspicious links
    if (hasSuspiciousLink(text)) {
        if (isFirstMessage) {
            return {
                isSpam: true,
                reason: 'link enviado na primeira mensagem'
            };
        }
        return {
            isSpam: true,
            reason: 'link suspeito detectado'
        };
    }

    // Additional safeguard for media messages with suspicious caption
    if ((message.type === 'sticker' || message.type === 'image') && hasSuspiciousKeyword(text)) {
        return {
            isSpam: true,
            reason: 'conteúdo suspeito em mídia (sticker ou imagem)'
        };
    }

    return {
        isSpam: false,
        reason: ''
    };
};

const isGroupMessage = (message: any): boolean => String(message?.from || '').endsWith('@g.us');

const canRemoveUser = async (chat: any, userId: string): Promise<boolean> => {
    if (!chat?.isGroup || typeof chat.removeParticipants !== 'function') {
        return false;
    }

    const participants = Array.isArray(chat?.participants)
        ? chat.participants
        : Array.isArray(chat?.groupMetadata?.participants)
            ? chat.groupMetadata.participants
            : [];

    const botParticipant = participants.find((participant: any) => participant.isMe);
    const userParticipant = participants.find((participant: any) => participant.id?._serialized === userId);

    const isBotAdmin = Boolean(botParticipant?.isAdmin || botParticipant?.isSuperAdmin);
    const isUserAdmin = Boolean(userParticipant?.isAdmin || userParticipant?.isSuperAdmin);

    return isBotAdmin && !isUserAdmin;
};

const handleModeration = async (client: any, message: any = {}): Promise<boolean> => {
    if (message.fromMe) {
        return false;
    }

    const userId = resolveUserId(message);

    // Se o usuário está na lista de bloqueio permanente, forçar ação de moderação
    const forcedSpam = BLOCKED_USERS.has(userId);

    const analysis = forcedSpam ? { isSpam: true, reason: 'usuário bloqueado permanentemente' } : analyzeMessage(message);

    if (!analysis.isSpam) {
        return false;
    }

    // Continue com a lógica de remoção e bloqueio como antes

    try {
        if (typeof message.delete === 'function') {
            await message.delete(true);
        }
    } catch (error: any) {
        loggerService.logWarning('Falha ao deletar mensagem suspeita', {
            reason: analysis.reason,
            userId,
            error: error.message
        });
    }

    if (isGroupMessage(message) && typeof message.getChat === 'function') {
        try {
            const chat = await message.getChat();
            const botCanRemove = await canRemoveUser(chat, userId);

            if (botCanRemove) {
                // Apagar mensagens anteriores do usuário
                try {
                    const messages = await chat.fetchMessages({ limit: 50 });
                    const userMessages = messages.filter((m: any) => m.author === userId);
                    
                    for (const msg of userMessages) {
                        try {
                            await msg.delete(true);
                        } catch (error) {
                            console.error('Erro ao apagar mensagem anterior:', error);
                        }
                    }
                    
                    loggerService.logInfo('Mensagens anteriores apagadas', {
                        userId,
                        count: userMessages.length
                    });
                } catch (error: any) {
                    loggerService.logWarning('Falha ao apagar mensagens anteriores', {
                        userId,
                        error: error.message
                    });
                }

                // Remover usuário do grupo
                await chat.removeParticipants([userId]);
            }
        } catch (error: any) {
            loggerService.logWarning('Falha ao remover usuario suspeito', {
                reason: analysis.reason,
                userId,
                error: error.message
            });
        }
    }

    try {
        if (typeof client?.blockContact === 'function') {
            await client.blockContact(userId);
        }
    } catch (error: any) {
        loggerService.logWarning('Falha ao bloquear contato suspeito', {
            reason: analysis.reason,
            userId,
            error: error.message
        });
    }

    loggerService.logInfo('Moderacao automatica aplicada', {
        reason: analysis.reason,
        userId,
        groupId: message.from || null
    });

    return true;
};

const resetModerationState = (): void => {
    seenUsers.clear();
};

export {
    SUSPICIOUS_TERMS,
    analyzeMessage,
    handleModeration,
    resetModerationState
};
