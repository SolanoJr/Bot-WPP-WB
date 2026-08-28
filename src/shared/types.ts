/**
 * 🔒 WarriorBlack - Protocolo de Tipagem Rigorosa
 */

export type WarriorKey = string; // Deve ter exatamente 16 caracteres

export interface ILocation {
    lat: number;
    lng: number;
    accuracy?: number;
    timestamp: string;
}

export interface ILocationPayload {
    token: string;
    chatId: string;
    location: ILocation;
    userAgent?: string;
    timestamp?: string;
}

export interface IStoredLocation extends ILocationPayload {
    id: number;
    receivedAt: string;
    processed: boolean;
    processedAt?: string;
}

export interface IClientMeta {
    lastSeen: string;
    totalLocations: number;
}

export interface IRelayResponse<T = any> {
    success: boolean;
    message?: string;
    error?: string;
    data?: T;
}

export interface IBotTelemetry {
    botNumber: string;
    botName: string;
    version: string;
    timestamp?: string;
}

export interface IGroupConfig {
    name?: string;
    welcomeMessage: string | null;
    customCommands: Record<string, string> | null;
    antispamActive: number;
    isActive: boolean;
}
