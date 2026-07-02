/**
 * 🔐 SISTEMA DE PERMISSÕES DO BOT
 * 
 * Controle de acesso baseado em níveis de usuário
 */

require('dotenv').config();

// Configuração de usuários
const MASTER_USER = process.env.MASTER_USER || '5588998314322@c.us';
const MASTER_NUMBER = process.env.MASTER_NUMBER || '5588998314322';
const ADMINS = new Set((process.env.ADMINS || '').split(',').filter(Boolean));

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
    if (!id || typeof id !== 'string') return '';
    // Lidar com IDs que podem vir como objetos ou strings complexas
    const baseId = id.includes('@') ? id.split('@')[0] : id;
    return baseId.replace(/\D/g, '');
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
 * Verifica se é MASTER (Método de Sufixo Infalível)
 * @param userId - ID do usuário
 * @returns É MASTER?
 */
function isMaster(userId: string): boolean {
    if (!userId || typeof userId !== 'string') return false;
  
    // OFICIAL - MAPEAMENTO LID (Linked ID)
    if (userId.includes('202658048684056')) return true;

    const clean = cleanId(userId);
    const masterClean = cleanId(MASTER_USER);
    const masterNumClean = cleanId(MASTER_NUMBER);

    return clean === masterClean || 
           clean === masterNumClean || 
           userId.includes('88998314322') ||
           userId.includes('8898314322'); // Fallback para variação de número
}

/**
 * Verifica se é ADMIN ou superior
 * @param userId - ID do usuário
 * @returns É ADMIN?
 */
function isAdmin(userId: string): boolean {
    return hasPermission(userId, PERMISSIONS.ADMIN);
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
