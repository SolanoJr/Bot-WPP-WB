import { IStoredLocation, IClientMeta, IBotTelemetry, IGroupConfig, ILocationPayload } from '@shared/types.js';

export interface IStorageRepository {
    saveLocation(payload: ILocationPayload): Promise<number>;
    getPendingLocation(chatId: string): Promise<IStoredLocation | null>;
    markAsProcessed(locationId: number): Promise<void>;
    updateClient(chatId: string): Promise<void>;
    saveTelemetry(data: IBotTelemetry): Promise<void>;
    getGroupConfig(groupId: string): Promise<IGroupConfig | null>;
    saveGroupConfig(groupId: string, config: Partial<IGroupConfig>): Promise<IGroupConfig>;
    getStats(): Promise<{ locations: number; clients: number }>;
}

export class InMemoryRepository implements IStorageRepository {
    private locations: IStoredLocation[] = [];
    private clients = new Map<string, IClientMeta>();
    private telemetry: IBotTelemetry[] = [];
    private groups = new Map<string, IGroupConfig>();

    async saveLocation(payload: ILocationPayload): Promise<number> {
        const id = Date.now();
        const newLocation: IStoredLocation = {
            ...payload,
            id,
            receivedAt: new Date().toISOString(),
            processed: false
        };

        this.locations.push(newLocation);

        // Manter limite de 500 para não estourar memória no Render
        if (this.locations.length > 500) {
            this.locations.shift();
        }

        return id;
    }

    async getPendingLocation(chatId: string): Promise<IStoredLocation | null> {
        return this.locations.find(loc => loc.chatId === chatId && !loc.processed) || null;
    }

    async markAsProcessed(locationId: number): Promise<void> {
        const loc = this.locations.find(l => l.id === locationId);
        if (loc) {
            loc.processed = true;
            loc.processedAt = new Date().toISOString();
        }
    }

    async updateClient(chatId: string): Promise<void> {
        const client = this.clients.get(chatId) || { totalLocations: 0, lastSeen: '' };
        client.lastSeen = new Date().toISOString();
        client.totalLocations++;
        this.clients.set(chatId, client);
    }

    async saveTelemetry(data: IBotTelemetry): Promise<void> {
        this.telemetry.push({ ...data, timestamp: new Date().toISOString() });
        if (this.telemetry.length > 100) this.telemetry.shift();
    }

    async getGroupConfig(groupId: string): Promise<IGroupConfig | null> {
        return this.groups.get(groupId) || null;
    }

    async saveGroupConfig(groupId: string, config: Partial<IGroupConfig>): Promise<IGroupConfig> {
        const current = this.groups.get(groupId) || {
            welcomeMessage: null,
            customCommands: null,
            antispamActive: 0,
            isActive: true
        };

        const next: IGroupConfig = {
            ...current,
            ...config,
            isActive: typeof config.isActive === 'boolean' ? config.isActive : Boolean(config.isActive ?? current.isActive)
        };

        this.groups.set(groupId, next);
        return next;
    }

    async getStats(): Promise<{ locations: number; clients: number }> {
        return {
            locations: this.locations.length,
            clients: this.clients.size
        };
    }
}
