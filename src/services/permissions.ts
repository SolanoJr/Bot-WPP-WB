/**
 * 🔐 SISTEMA DE PERMISSÕES DO BOT
 * 
 * Controle de acesso baseado em níveis de usuário
 */

// Configuração de usuários
const MASTER_USER = process.env.MASTER_USER || '5588998314322@c.us';
const MASTER_NUMBER = process.env.MASTER_NUMBER || '5588998314322';
const ADMINS = new Set((process.env.ADMINS || '').split(',').filter(Boolean));

// LID (Linked ID) do dono. O WhatsApp moderno entrega @lid em vez de @c.us; o LID
// é OPACO (seus dígitos NÃO são o telefone), então precisa de lista própria.
// ⚠️ NÃO confundir com o LID do BOT: `2592935567439` é o LID do WarriorBlack
// (provado no log do Baileys: myPN=558581344211 / myLID=2592935567439).
const MASTER_LID = process.env.MASTER_LID || '';

/** Identificador do próprio bot (número e LID), usado para imunidade. */
const BOT_NUMBER = (process.env.MAIN_NUMBER || '558581344211').replace(/\D/g, '');
const BOT_LID = (process.env.BOT_LID || '2592935567439').replace(/\D/g, '');

/**
 * Extrai o LID de um identificador, se ele for um @lid.
 * Aceita prefixo de plataforma (wpp:/tg:/dc:) e sufixo de device (:60).
 * @returns dígitos do LID, ou '' se o id não for @lid.
 */
function extractLid(id: string): string {
    if (!id || typeof id !== 'string') return '';
    const bare = id.replace(/^(wpp:|tg:|dc:)/, '');
    if (!bare.includes('@lid')) return '';
    return bare.split('@')[0].split(':')[0].replace(/\D/g, '');
}

/**
 * Conjunto de LIDs que identificam o dono.
 * Fontes: env MASTER_LID + o LID historicamente documentado do dono.
 * BLINDAGEM: o LID do BOT é removido do conjunto. Em 26/08/2026 o .env de
 * produção tinha MASTER_LID=2592935567439@lid, que é o LID do PRÓPRIO BOT —
 * confiar nele cegamente faria o bot ser tratado como dono (escalada de
 * privilégio) e mandaria os alertas de notifyOwner para ele mesmo.
 */
const MASTER_LIDS = new Set(
    [MASTER_LID, '202658048684056']
        .map(v => extractLid(v) || String(v).replace(/\D/g, ''))
        .filter(Boolean)
        .filter(lid => lid !== BOT_LID)
);
if (MASTER_LID && MASTER_LIDS.size === 0) {
    console.warn('[PERMISSÃO] ⚠️ MASTER_LID configurado é igual ao LID do BOT — IGNORADO. Configure o LID real do dono.');
}

/**
 * Conjunto de telefones (só dígitos) que identificam o dono.
 * Inclui as variações legítimas do MESMO número brasileiro:
 *  - com e sem DDI 55
 *  - com 9 dígitos (pós-2012) e com 8 dígitos (formato antigo), pois contatos
 *    antigos e alguns grupos ainda carregam a forma sem o nono dígito.
 * Todas entram como valores EXATOS — nunca como substring.
 */
function phoneVariants(raw: string): string[] {
    const d = String(raw || '').replace(/\D/g, '');
    if (!d) return [];
    const out = new Set<string>([d]);
    const withoutDdi = d.startsWith('55') ? d.slice(2) : d;
    const withDdi = d.startsWith('55') ? d : '55' + d;
    out.add(withoutDdi);
    out.add(withDdi);
    // DDD (2) + número. Se tiver 9 dígitos iniciando em 9, gera a forma de 8.
    for (const base of [withoutDdi, withDdi]) {
        const ddiLen = base.startsWith('55') ? 2 : 0;
        const ddd = base.slice(ddiLen, ddiLen + 2);
        const local = base.slice(ddiLen + 2);
        if (local.length === 9 && local.startsWith('9')) {
            out.add(base.slice(0, ddiLen) + ddd + local.slice(1));
        } else if (local.length === 8) {
            out.add(base.slice(0, ddiLen) + ddd + '9' + local);
        }
    }
    return [...out];
}

const MASTER_PHONES = new Set<string>(
    [MASTER_USER, MASTER_NUMBER].flatMap(phoneVariants)
);

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
    // Remove prefixo de plataforma (wpp:/tg:/dc:) que o PlatformManager adiciona.
    const bare = id.replace(/^(wpp:|tg:|dc:)/, '');
    // Corta o domínio (@c.us / @lid / @g.us / @s.whatsapp.net) e o sufixo de
    // device do Baileys (':60'), que senão vazava para dentro do ID e fazia
    // '2592935567439:60@lid' virar '259293556743960' (ID inexistente).
    const baseId = (bare.includes('@') ? bare.split('@')[0] : bare).split(':')[0];
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
        console.log(`[PERMISSÃO] Recebido: ${userClean} | Master: ${cleanId(MASTER_USER)} | Resultado: [${hasPerm ? 'Sim' : 'Não'}]`);
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

    // LID (Linked ID) do dono: comparação EXATA do identificador, nunca substring.
    // Substring permitia escalada de privilégio (ex.: '1188998314322@c.us' contém
    // o número do dono e era aceito como MASTER).
    const lid = extractLid(userId);
    if (lid && MASTER_LIDS.has(lid)) return true;

    // Se o ID é um @lid e NÃO está na lista de LIDs do dono, ele não é o MASTER.
    // Um LID é opaco: seus dígitos não são telefone, então comparar com o número
    // do dono produziria falso positivo/negativo. Encerramos aqui.
    if (lid) return false;

    const clean = cleanId(userId);
    if (!clean) return false;
    return MASTER_PHONES.has(clean);
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

/**
 * Alvos que NUNCA podem ser alvo de ação negativa (kick/ban/mute/delete/promover),
 * independente de quem manda o comando.
 * - MASTER (dono do bot): telefone + LID
 * - O próprio bot (WarriorBlack): telefone + LID
 *
 * Comparação EXATA (nunca substring/endsWith): 'endsWith' permitia que um número
 * terminando com os dígitos do dono (ex.: '99558581344211') fosse protegido por
 * acidente, e a mesma classe de comparação frouxa é uma via de escalada em isMaster.
 */
const PROTECTED_PHONES = new Set<string>([
    ...MASTER_PHONES,
    ...phoneVariants(BOT_NUMBER),
]);
const PROTECTED_LIDS = new Set<string>([
    ...MASTER_LIDS,
    BOT_LID,            // LID do próprio bot (2592935567439)
]);

function isProtectedTarget(userId: string): boolean {
    if (!userId || typeof userId !== 'string') return false;

    const lid = extractLid(userId);
    if (lid) return PROTECTED_LIDS.has(lid);

    const clean = cleanId(userId);
    if (!clean) return false;
    return PROTECTED_PHONES.has(clean);
}

/** Expõe os identificadores do bot (para adapters evitarem se auto-notificar). */
function getBotIdentifiers(): { number: string; lid: string } {
    return { number: BOT_NUMBER, lid: BOT_LID };
}

/**
 * Resolve o destino de notificação do DONO.
 * Prefere o LID válido do dono; se não houver (ou se o env estiver com o LID do
 * bot), cai para MASTER_USER em formato @c.us. NUNCA devolve o ID do bot.
 */
function getOwnerNotifyTarget(): string {
    const lid = [...MASTER_LIDS][0];
    if (lid) return `${lid}@lid`;
    const phone = [...MASTER_PHONES][0];
    return phone ? `${phone}@c.us` : '';
}

export {
    PERMISSIONS,
    getUserPermission,
    hasPermission,
    isMaster,
    isAdmin,
    isProtectedTarget,
    getBotIdentifiers,
    getOwnerNotifyTarget,
    extractLid,
    requirePermission,
    MASTER_USER,
    MASTER_NUMBER,
    ADMINS,
    cleanId
};
