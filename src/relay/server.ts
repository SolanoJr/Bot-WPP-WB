import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { InMemoryRepository } from './repositories/storage.repository.js';
import { IBotTelemetry, IGroupConfig, ILocationPayload, WarriorKey } from '../shared/types.js';

const app = express();
const PORT = process.env.PORT || 3000;

// 🛡️ Configuração Warrior
const WARRIOR_AUTH_KEY: WarriorKey = process.env.WARRIOR_AUTH_KEY || 'solano_wb_gps_26';
const repository = new InMemoryRepository();

const allowedOrigins = [
    'https://bot-wpp-wb-sc.pages.dev',
    'http://localhost:3000',
    'https://bot-wpp-relay.onrender.com'
];

// 🔐 Middleware de Autenticação & CORS Manual
app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && allowedOrigins.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin);
    } else {
        res.header('Access-Control-Allow-Origin', 'https://bot-wpp-wb-sc.pages.dev');
    }

    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, x-api-key, Authorization, Cache-Control, Pragma, Expires');
    res.header('Access-Control-Allow-Credentials', 'true');

    if (req.method === 'OPTIONS') {
        return res.sendStatus(204);
    }
    next();
});

app.use(cors());
app.use(express.json({ limit: '1mb' }));

// 👮 Middleware de Validação de Chave
const checkApiKey = (req: Request, res: Response, next: NextFunction) => {
    const providedKey = req.headers['x-api-key'] as string;
    const expectedKey = String(WARRIOR_AUTH_KEY).trim();
    const receivedKey = providedKey ? String(providedKey).trim() : '';

    if (receivedKey !== expectedKey) {
        console.warn(`🔒 [SECURITY] Acesso negado em ${req.path}`);
        return res.status(401).json({
            success: false,
            error: 'auth_failed',
            received_len: receivedKey.length,
            expected_len: expectedKey.length
        });
    }
    next();
};

// --- ROTAS ---

app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'warrior-relay-ts', timestamp: new Date().toISOString() });
});

app.get('/debug-env-check', async (_req, res) => {
    const stats = await repository.getStats();
    res.json({
        ok: true,
        len: WARRIOR_AUTH_KEY.length,
        prefix: WARRIOR_AUTH_KEY.substring(0, 4),
        storage: stats,
        timestamp: new Date().toISOString()
    });
});

app.post('/location', checkApiKey, async (req: Request, res: Response) => {
    try {
        const payload = req.body as ILocationPayload;
        const id = await repository.saveLocation(payload);
        await repository.updateClient(payload.chatId);

        console.log(`✅ [RELAY-TS] Localização armazenada: ${payload.chatId}`);
        res.json({ success: true, locationId: id });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/telemetry', checkApiKey, async (req: Request, res: Response) => {
    try {
        const telemetry = req.body as IBotTelemetry;
        await repository.saveTelemetry(telemetry);

        console.log(`[RELAY-TS] Telemetria recebida: ${telemetry.botNumber || 'unknown'}`);
        res.json({ success: true, message: 'telemetry_saved' });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/groups/:groupId/config', checkApiKey, async (req: Request, res: Response) => {
    try {
        const groupId = String(req.params.groupId).trim();
        const config = await repository.getGroupConfig(groupId);

        res.json({
            success: true,
            data: config,
            ...(config || {})
        });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/groups/:groupId/config', checkApiKey, async (req: Request, res: Response) => {
    try {
        const groupId = String(req.params.groupId).trim();
        const body = req.body as Omit<Partial<IGroupConfig>, 'isActive'> & { isActive?: boolean | number };
        const config = await repository.saveGroupConfig(groupId, {
            ...body,
            isActive: typeof body.isActive === 'number' ? body.isActive === 1 : body.isActive
        });

        console.log(`[RELAY-TS] Config de grupo salva: ${groupId}`);
        res.json({
            success: true,
            data: config,
            ...config
        });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/pending/:chatId', checkApiKey, async (req: Request, res: Response) => {
    try {
        const chatId = String(req.params.chatId).trim();
        const location = await repository.getPendingLocation(chatId);

        if (!location) return res.status(204).send();

        await repository.markAsProcessed(location.id);
        console.log(`📤 [RELAY-TS] Enviando pendente para: ${chatId}`);
        res.json(location);
    } catch (error) {
        res.status(204).send();
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Relay Server (TS) ONLINE na porta ${PORT}`);
    console.log(`🔐 Warrior Key: ${WARRIOR_AUTH_KEY.substring(0, 4)}... (Len: ${WARRIOR_AUTH_KEY.length})`);
});
