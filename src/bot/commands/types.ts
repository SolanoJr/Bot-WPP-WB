import { CommandContext, PlatformType } from '../../../platforms/base/PlatformTypes';

// Interface para comandos - usa CommandContext unificado
export interface ICommand {
    name: string;
    description: string;
    platforms?: PlatformType[];    // Se undefined, disponível em todas
    execute(ctx: CommandContext): Promise<void> | void;
}

// Tipo para compatibilidade com comandos legados (msg, client, args)
export type LegacyCommandExecute = (msg: any, client: any, args: string[]) => Promise<void> | void;

export interface ILegacyCommand {
    name: string;
    description: string;
    execute: LegacyCommandExecute;
}