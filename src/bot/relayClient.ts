import axios, { AxiosInstance } from 'axios';
import {
    IBotTelemetry,
    IGroupConfig,
    IRelayResponse,
    IStoredLocation,
    WarriorKey
} from '../shared/types.js';

export interface IRelayClientOptions {
    relayUrl: string;
    warriorAuthKey: WarriorKey;
    timeoutMs?: number;
}

export interface IRelayHealthResponse {
    ok: boolean;
    service?: string;
    timestamp?: string;
}

export class RelayClient {
    private readonly http: AxiosInstance;

    constructor(options: IRelayClientOptions) {
        this.http = axios.create({
            baseURL: options.relayUrl.replace(/\/+$/, ''),
            timeout: options.timeoutMs || 10000,
            headers: {
                Accept: 'application/json',
                'x-api-key': options.warriorAuthKey
            }
        });
    }

    async health(): Promise<IRelayHealthResponse> {
        const response = await this.http.get<IRelayHealthResponse>('/health');
        return response.data;
    }

    async getPendingLocation(chatId: string): Promise<IStoredLocation | null> {
        const response = await this.http.get<IStoredLocation>(`/pending/${encodeURIComponent(chatId)}`, {
            validateStatus: status => status === 200 || status === 204
        });

        if (response.status === 204) {
            return null;
        }

        return response.data;
    }

    async saveTelemetry(data: IBotTelemetry): Promise<IRelayResponse> {
        const response = await this.http.post<IRelayResponse>('/telemetry', data);
        return response.data;
    }

    async getGroupConfig(groupId: string): Promise<IRelayResponse<IGroupConfig | null>> {
        const response = await this.http.get<IRelayResponse<IGroupConfig | null>>(
            `/groups/${encodeURIComponent(groupId)}/config`
        );
        return response.data;
    }

    async saveGroupConfig(groupId: string, config: Partial<IGroupConfig>): Promise<IRelayResponse<IGroupConfig>> {
        const response = await this.http.post<IRelayResponse<IGroupConfig>>(
            `/groups/${encodeURIComponent(groupId)}/config`,
            config
        );
        return response.data;
    }
}
