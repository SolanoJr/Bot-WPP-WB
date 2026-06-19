const isValidCommand = (text: string): boolean => {
    const configuredPrefix = process.env.COMMAND_PREFIX || '!';
    const alternatePrefix = configuredPrefix === '$' ? '!' : '$';
    const prefixes = [configuredPrefix, alternatePrefix];

    return typeof text === 'string' && prefixes.some((prefix) => text.trim().startsWith(prefix));
};

export { isValidCommand };
