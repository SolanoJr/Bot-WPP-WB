import { IGroupConfig, IRelayResponse } from '../shared/types.js';

type LegacyGroupConfigResponse = IRelayResponse<IGroupConfig | null> & Partial<IGroupConfig>;

export function resolveCustomCommand(
    response: LegacyGroupConfigResponse | null | undefined,
    commandName: string
): string | null {
    const customCommands = response?.data?.customCommands || response?.customCommands || null;

    if (!customCommands) {
        return null;
    }

    return customCommands[commandName] || null;
}
