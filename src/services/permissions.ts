/**
 * 🔐 SISTEMA DE PERMISSÕES DO BOT
 * 
 * Controle de acesso baseado em níveis de usuário
 */

import { IBotMessage } from '../shared/types';
require('dotenv').config();

// Configuração de usuários
const MASTER_USER = process.env.MASTER_USER || '5588998314322@c.us';
const MASTER_NUMBER = process.env.MASTER_NUMBER || '5588998314322';
const ADMINS = new Set((process.env.ADMINS || '').split(',').filter(Boolean));

// IDs de Master em outras plataformas (opcional via .env)
const TELEGRAM_MASTER = process.env.TELEGRAM_MASTER_ID || '1426466318'; // Exemplo de ID do usuário
const DISCORD_MASTER = process.env.DISCORD_MASTER_ID || '1177651034533036063';

// Níveis de permissão
const PERMISSIONS = {
    MASTER: 'MASTER',    // Controle total
    ADMIN: 'ADMIN',      // Controle de grupo
    USER: 'USER'         // Usuário comum
} as const;

type PermissionLevel = typeof PERMISSIONS[keyof typeof PERMISSIONS];

/**
 * Limpa o ID do WhatsApp para conter apenas números
 * @param id - ID original (ex: 558581344211@c.us)
 * @returns Apenas os dígitos
 */
function cleanId(id: string): string {
    if (!id) return '';
    return id.split('@')[0].replace(/\D/g, '');
}

/**
 * Verifica o nível de permissão do usuário
 * @param userId - ID do usuário no WhatsApp
 * @returns Nível de permissão
 */
function getUserPermission(userId: string): PermissionLevel {
    if (isMaster(userId)) {
        return PERMISSIONS.MASTER;
    }
    
    const userClean = cleanId(userId);
    const CLEAN_ADMINS = new Set([...ADMINS].map(id => cleanId(id)));
    if (CLEAN_ADMINS.has(userClean)) {
        return PERMISSIONS.ADMIN;
    }
    
    return PERMISSIONS.USER;
}

/**
 * Verifica se o usuário tem permissão mínima
 * @param userId - ID do usuário
 * @param requiredLevel - Nível requerido
 * @returns Tem permissão?
 */
function hasPermission(userId: string, requiredLevel: PermissionLevel): boolean {
    const userLevel = getUserPermission(userId);
    
    // Hierarquia: MASTER > ADMIN > USER
    const levels: Record<PermissionLevel, number> = {
        [PERMISSIONS.MASTER]: 3,
        [PERMISSIONS.ADMIN]: 2,
        [PERMISSIONS.USER]: 1
    };
    
    const hasPerm = levels[userLevel] >= levels[requiredLevel];
    const userClean = cleanId(userId);

    // Log solicitado: [PERMISSÃO]
    if (requiredLevel !== PERMISSIONS.USER) {
        console.log(`[PERMISSÃO] Recebido: ${userClean} | Master: 88998314322 | Resultado: [${hasPerm ? 'Sim' : 'Não'}]`);
    }

    return hasPerm;
}

/**
 * Verifica se é MASTER (Multiplataforma)
 * @param userId - ID do usuário
 * @param platform - Plataforma opcional
 * @returns É MASTER?
 */
function isMaster(userId: string, platform: string = 'whatsapp'): boolean {
    if (!userId) return false;
  
    // 1. Verificação WhatsApp
    if (platform === 'whatsapp') {
        if (userId === '202658048684056@lid') return true;
        const clean = cleanId(userId);
        const masterClean = cleanId(MASTER_USER);
        const masterNumClean = cleanId(MASTER_NUMBER);
        if (clean === masterClean || clean === masterNumClean || userId.includes('88998314322')) return true;
    }

    // 2. Verificação Telegram
    if (platform === 'telegram') {
        if (userId === TELEGRAM_MASTER) return true;
    }

    // 3. Verificação Discord
    if (platform === 'discord') {
        if (userId === DISCORD_MASTER) return true;
    }

    return false;
}

/**
 * Verifica se é ADMIN ou superior (Com Fallback Robusto)
 * @param msg - Mensagem (IBotMessage ou Raw)
 * @param client - Cliente da plataforma
 * @returns É ADMIN?
 */
async function isAdmin(msg: any, client: any): Promise<boolean> {
    const userId = msg.author || msg.from;
    const platform = (msg as IBotMessage).platform || 'whatsapp';

    // Master sempre é Admin
    if (isMaster(userId, platform)) return true;

    // Verificar lista de admins global (ID fixo no .env)
    const userClean = cleanId(userId);
    const CLEAN_ADMINS = new Set([...ADMINS].map(id => cleanId(id)));
    if (CLEAN_ADMINS.has(userClean)) return true;

    // Verificação Dinâmica por Plataforma
    try {
        if (platform === 'whatsapp') {
            // No WhatsApp, mensagens PV não têm 'author', apenas 'from'
            const isGroup = msg.isGroup || (typeof msg.getChat === 'function' && (await msg.getChat()).isGroup);
            if (!isGroup) return true;

            // Forçar recarga do chat para evitar cache de permissões antigo
            const chatId = msg.from;
            const chat = await client.getChatById(chatId);

            if (!chat.isGroup) return true;

            const participant = chat.participants.find((p: any) =>
                p.id._serialized === userId || p.id.user === userClean
            );

            const result = !!(participant?.isAdmin || participant?.isSuperAdmin);

            // Log de depuração para fallbacks
            console.log(`[PERMISSIONS] WhatsApp Admin Check: User=${userClean} Group=${chatId} Result=${result}`);

            return result;
        }

        if (platform === 'telegram') {
            const member = await client.getChatMember(msg.from, parseInt(userId));
            return ['creator', 'administrator'].includes(member.status);
        }

        if (platform === 'discord') {
            const member = msg.raw?.member;
            if (member) return member.permissions.has('Administrator');
            return false;
        }
    } catch (error) {
        console.error(`[PERMISSIONS] Erro ao validar Admin na plataforma ${platform}:`, error);
    }

    return false;
}

/**
 * Middleware para comandos que requerem permissão
 * @param requiredLevel - Nível requerido
 * @returns Middleware function
 */
function requirePermission(requiredLevel: PermissionLevel) {
    return (msg: any, client: any, args: any[], next?: () => void) => {
        const userId = msg.author || msg.from;
        
        // Log de AUDITORIA REAL solicitado
        console.log(`[DEBUG] ID Bruto Recebido: ${userId}`);

        if (!hasPermission(userId, requiredLevel)) {
            switch (requiredLevel) {
                case PERMISSIONS.MASTER:
                    msg.reply('🚫 **Acesso negado!**\n\nEste comando só pode ser usado pelo **MASTER** do bot.');
                    break;
                case PERMISSIONS.ADMIN:
                    msg.reply('🚫 **Acesso negado!**\n\nEste comando requer permissão de **ADMIN** ou superior.');
                    break;
                default:
                    msg.reply('🚫 **Acesso negado!**');
            }
            
            return false;
        }
        
        return next ? next() : true;
    };
}

export {
    PERMISSIONS,
    getUserPermission,
    hasPermission,
    isMaster,
    isAdmin,
    requirePermission,
    MASTER_USER,
    MASTER_NUMBER,
    ADMINS,
    cleanId
};
