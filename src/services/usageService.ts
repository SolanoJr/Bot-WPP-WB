const commandUsage: Record<string, number> = Object.create(null);
const userUsage: Record<string, number> = Object.create(null);

const registerUsage = (commandName: string, userId: string): void => {
    const safeCommandName = String(commandName || 'desconhecido').toLowerCase();
    const safeUserId = String(userId || 'usuario-desconhecido');

    commandUsage[safeCommandName] = (commandUsage[safeCommandName] || 0) + 1;
    userUsage[safeUserId] = (userUsage[safeUserId] || 0) + 1;
};

const getCommandUsage = (): Record<string, number> => ({ ...commandUsage });

const getUserUsage = (): Record<string, number> => ({ ...userUsage });

interface UserUsage {
    userId: string;
    count: number;
}

const getTopUsers = (limit: number = 5): UserUsage[] => {
    const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 5;

    return Object.entries(userUsage)
        .sort(([, usageA], [, usageB]) => usageB - usageA)
        .slice(0, safeLimit)
        .map(([userId, count]) => ({ userId, count }));
};

const resetUsage = (): void => {
    for (const key of Object.keys(commandUsage)) {
        delete commandUsage[key];
    }

    for (const key of Object.keys(userUsage)) {
        delete userUsage[key];
    }
};

export {
    registerUsage,
    getCommandUsage,
    getUserUsage,
    getTopUsers,
    resetUsage
};
