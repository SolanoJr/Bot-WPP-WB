/**
 * 🔐 SISTEMA DE PERMISSÕES DO BOT
 * 
 * Controle de acesso baseado em níveis de usuário
 */

import logger from './loggerService';

// Configuração de usuários
/**
 * MASTER_USER é obrigatório — sem fallback hardcoded.
 *
 * Lazy: o valor é lido no USO, não no load do módulo. Se faltar, a falha
 * acontece na hora de AUTORIZAR, não no import. Isso evita que qualquer import
 * transitivo (CLI, worker, teste de integração) exploda antes do dotenv ter
 * chance de rodar — foi o que causou o crash loop de 14/out.
 *
 * Sem cache: cada chamada relê process.env (barato, e mantém determinísticos
 * os testes que mexem no env).
 */
function getMasterUser(): string {
    const v = process.env.MASTER_USER;
    if (!v) {
        throw new Error('MASTER_USER environment variable is required');
    }
    return v;
}
const MASTER_NUMBER = process.env.MASTER_NUMBER ?? '';
const ADMINS = new Set((process.env.ADMINS || '').split(',').filter(Boolean));
const BOT_NUMBER = process.env.BOT_NUMBER || '558581344211';
const BOT_LID = process.env.BOT_LID || '2592935567439';
const OWNER_LID = process.env.MASTER_LID || '202658048684056';
const OWNER_NUMBER_ALIASES = new Set(['88998314322', '8898314322', '558898314322']);
const BOT_NUMBER_ALIASES = new Set([cleanId(BOT_NUMBER), '5585981344211']);

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
    const baseId = (id.includes('@') ? id.split('@')[0] : id)
        .replace(/^[a-z]+:/i, '')
        .split(':')[0];
    return baseId.replace(/\D/g, '');
}

function extractLid(id: string): string {
    if (!id || typeof id !== 'string' || !id.includes('@lid')) return '';
    return cleanId(id);
}

function isBotTarget(userId: string): boolean {
    return BOT_NUMBER_ALIASES.has(cleanId(userId)) ||
        extractLid(userId) === cleanId(BOT_LID);
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
        logger.debug('[PERMISSÃO] Verificação', {
            user: userClean,
            master: cleanId(getMasterUser()),
            hasPermission: hasPerm
        });
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

    const userClean = cleanId(userId);
    const userLid = extractLid(userId);
    if (isBotTarget(userId)) return false;

    const clean = userClean;
    const masterClean = cleanId(getMasterUser());
    const masterNumClean = cleanId(MASTER_NUMBER);
        const ownerLid = cleanId(OWNER_LID);

        return clean === masterClean || clean === masterNumClean ||
            OWNER_NUMBER_ALIASES.has(clean) ||
           (userLid !== '' && userLid === ownerLid);
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
        logger.debug('[DEBUG] ID Bruto Recebido', { userId });

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

/**
 * Verifica se um usuário é um alvo protegido (não deve ser afetado por
 * ações destrutivas como $delete de mensagem ou $demote) — ou seja, o dono (MASTER)
 * ou um ADMIN. Usado por comandos de moderação para evitar auto-sabotagem.
 */
export function isProtectedTarget(userId: string): boolean {
    return isMaster(userId) || isBotTarget(userId);
}

/**
 * Retorna o ID do dono para notificações (QR codes, alertas, etc.).
 * Blinda contra o caso de retornar o LID do próprio bot (202658048684056@lid).
 * Prioridade: MASTER_LID > MASTER_USER > MASTER_NUMBER
 */
export function getOwnerNotifyTarget(): string | null {
  // MASTER_LID explícito no .env (ex: 202658048684056@lid)
  if (process.env.MASTER_LID) {
    const lid = process.env.MASTER_LID.trim();
    // Garante que não é o LID do próprio bot
    if (!isBotTarget(lid)) return lid;
    logger.warn('[permissions] MASTER_LID é o identificador do próprio bot — ignorando');
  }
  // MASTER_USER (formato completo: 5588998314322@c.us ou @lid)
  if (process.env.MASTER_USER) {
    const user = process.env.MASTER_USER.trim();
    if (!isBotTarget(user)) return user;
  }
  // MASTER_NUMBER (apenas números: 5588998314322)
  if (process.env.MASTER_NUMBER) {
    const num = process.env.MASTER_NUMBER.trim();
    if (!isBotTarget(num)) return `${num}@c.us`;
  }
  // Fallback hardcoded (mantém compatibilidade)
  return '5588998314322@c.us';
}

/**
 * Sanidade de configuração do MASTER — chamada no boot (após dotenv.config()).
 *
 * Bug do master fantasma (19/10): MASTER_USER=55858134422@c.us no .env (typo
 * do número do bot) ninguém portava — e um número fixo real de Fortaleza com
 * esses dígitos seria reconhecido como MASTER por `clean === masterClean`.
 *
 * logWarning APENAS: NUNCA lança nem bloqueia o boot — o crash-loop de 14/out
 * (comentário em getMasterUser) foi uma validação que derrubava o processo
 * antes do dotenv rodar; este detector não repete esse erro.
 */
export function validateMasterConfig(): void {
    const raw = (process.env.MASTER_USER || '').trim();
    if (!raw) {
        logger.warn('[permissions] ⚠️ MASTER_USER ausente no .env — dono reconhecível só via MASTER_LID/OWNER aliases');
        return;
    }
    const clean = cleanId(raw);
    const botClean = cleanId(BOT_NUMBER);
    if (clean === botClean) {
        logger.warn(`[permissions] ⚠️ MASTER_USER (${raw}) é o número do PRÓPRIO BOT — typo no .env? Esta via nunca reconhecerá o dono`);
        return;
    }
    if (!/^55\d{10,11}$/.test(clean)) {
        logger.warn(`[permissions] ⚠️ MASTER_USER (${raw}) fora do padrão BR (12-13 dígitos iniciando por 55) — provável typo; dono segue reconhecível via MASTER_LID/aliases`);
    }
}

export {
    PERMISSIONS,
    getUserPermission,
    hasPermission,
    isMaster,
    isAdmin,
    requirePermission,
    getMasterUser,
    MASTER_NUMBER,
    ADMINS,
    cleanId,
    extractLid,
    isBotTarget
};
