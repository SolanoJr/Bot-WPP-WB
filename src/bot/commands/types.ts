// src/bot/commands/types.ts
// Fonte única de ICommand: re-exporta de PlatformTypes para evitar dupla definição.
export { ICommand, CommandContext, PlatformType } from '../../platforms/base/PlatformTypes';

// Tipo para compatibilidade com comandos legados (msg, client, args)
export type LegacyCommandExecute = (msg: any, client: any, args: string[]) => Promise<void> | void;

export interface ILegacyCommand {
    name: string;
    description: string;
    execute: LegacyCommandExecute;
}
