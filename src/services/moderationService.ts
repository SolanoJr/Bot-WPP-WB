import loggerService from './loggerService';

// Configurações de moderação (podem ser movidas para um banco de dados futuramente)
export const moderationConfig = {
    enabled: true,
    ddiFilterEnabled: true,
    interactiveFilterEnabled: true,
    suspiciousLinksFilterEnabled: true,
    keywordsFilterEnabled: true
};

const SUSPICIOUS_TERMS = [
    'taxa de vitórias',
    'recolha contínua',
    'bónus',
    'recolhidos à vontade',
    'pp7.wtf',
    '.bet',
    '.wtf?c=',
    'ganhar dinheiro',
    'lucro fácil',
    'cassino'
];

const BLOCKED_USERS = new Set<string>([
    '639474500179@c.us'
]);

const seenUsers = new Set<string>();

const normalizeText = (text: any): string => String(text || '').toLowerCase();

const hasSuspiciousContent = (text: string): boolean => {
    const normalized = normalizeText(text);
    return SUSPICIOUS_TERMS.some(term => normalized.includes(term)) || 
           /https?:\/\/[^\s]+(\.wtf|\.bet)/i.test(normalized);
};

const isForeignNumber = (userId: string): boolean => {
    // DDI brasileiro é 55. Números do WhatsApp vêm no formato 5511999999999@c.us
    return !userId.startsWith('55');
};

const extractTextFromInteractive = (message: any): string => {
    let text = message.body || message.caption || '';
    
    // Tenta extrair texto de mensagens interativas/templates (baseado na estrutura interna do whatsapp-web.js/WA Web)
    if (message._data) {
        const data = message._data;
        // Captura textos de botões, títulos e descrições de templates/cards
        const interactiveParts = [
            data.title,
            data.description,
            data.footer,
            data.caption,
            data.body,
            data.matchedText
        ];
        
        // Se for template ou botões, busca nos arrays internos
        if (data.buttons) {
            data.buttons.forEach((btn: any) => {
                if (btn.buttonText) interactiveParts.push(btn.buttonText.displayText);
            });
        }
        
        if (data.listResponse) {
            interactiveParts.push(data.listResponse.title);
            interactiveParts.push(data.listResponse.description);
        }

        text += ' ' + interactiveParts.filter(Boolean).join(' ');
    }
    
    return text;
};

interface AnalysisResult {
    isSpam: boolean;
    reason: string;
}

export const analyzeMessage = (message: any = {}): AnalysisResult => {
    if (!moderationConfig.enabled) return { isSpam: false, reason: '' };

    const userId = message.author || message.from || '';
    const text = extractTextFromInteractive(message);
    const isFirstInteraction = !seenUsers.has(userId);

    if (isFirstInteraction) {
        seenUsers.add(userId);
    }

    // 1. Filtro por DDI Estrangeiro + Conteúdo Suspeito ou Link
    if (moderationConfig.ddiFilterEnabled && isForeignNumber(userId)) {
        const hasLink = /https?:\/\/[^\s]+/i.test(text);
        const isInteractive = ['buttons_response', 'list_response', 'template_button_reply', 'interactive'].includes(message.type);
        
        if (hasLink || isInteractive || hasSuspiciousContent(text)) {
            return {
                isSpam: true,
                reason: `DDI Estrangeiro detectado (${userId.split('@')[0]}) com conteúdo suspeito/link.`
            };
        }
    }

    // 2. Filtro de Palavras-Chave e Regex
    if (moderationConfig.keywordsFilterEnabled && hasSuspiciousContent(text)) {
        return {
            isSpam: true,
            reason: 'Palavra-chave ou padrão de spam detectado.'
        };
    }

    // 3. Bloqueio Permanente
    if (BLOCKED_USERS.has(userId)) {
        return {
            isSpam: true,
            reason: 'Usuário na lista negra de spammers.'
        };
    }

    return { isSpam: false, reason: '' };
};

const isGroupMessage = (message: any): boolean => String(message?.from || '').endsWith('@g.us');

export const handleModeration = async (client: any, message: any = {}): Promise<boolean> => {
    if (message.fromMe) return false;

    const analysis = analyzeMessage(message);
    if (!analysis.isSpam) return false;

    const userId = message.author || message.from;

    console.log(`🛡️ [MODERATION] Gatilho acionado para ${userId}. Motivo: ${analysis.reason}`);

    try {
        // 1. Deletar a mensagem imediatamente
        if (typeof message.delete === 'function') {
            await message.delete(true);
            console.log(`🗑️ [MODERATION] Mensagem de spam deletada.`);
        }

        // 2. Se for grupo, banir o usuário
        if (isGroupMessage(message)) {
            const chat = await message.getChat();
            if (chat.isGroup) {
                // Verificar se o bot é admin
                const participants = chat.participants || [];
                const botParticipant = participants.find((p: any) => p.id._serialized === client.info.wid._serialized);
                
                if (botParticipant?.isAdmin || botParticipant?.isSuperAdmin) {
                    await chat.removeParticipants([userId]);
                    console.log(`🚫 [MODERATION] Usuário ${userId} removido do grupo.`);
                } else {
                    console.warn(`⚠️ [MODERATION] Bot não é admin, não pôde remover o usuário.`);
                }
            }
        }

        // 3. Bloquear o contato (opcional, mas solicitado como punição imediata)
        try {
            const contact = await client.getContactById(userId);
            await contact.block();
            console.log(`🔒 [MODERATION] Contato ${userId} bloqueado.`);
        } catch (e) {
            // Ignora se falhar o bloqueio (algumas versões da API têm problemas aqui)
        }

        loggerService.logInfo('Moderação automática aplicada com sucesso', {
            userId,
            reason: analysis.reason,
            groupId: message.from
        });

        return true;
    } catch (error: any) {
        console.error(`❌ [MODERATION] Erro ao aplicar punição:`, error.message);
        return false;
    }
};

export const resetModerationState = (): void => {
    seenUsers.clear();
};
