/**
 * laboratorio/execute-casino-delete.ts
 *
 * FASE 4: Delete experimental da mensagem real de cassino no grupo "Figurinhas".
 *
 * AUTORIZAÇÃO: explícita do dono após validação da mensagem.
 *
 * REGRAS ABSOLUTAS:
 * - SOMENTE apaga a mensagem identificada (não deleta outras)
 * - NÃO remove participante
 * - NÃO bane
 * - Valida isProtectedTarget antes de qualquer ação
 * - Usa messageKey real extraído do discovery
 * - Registra resultado completo
 *
 * ARQUITETURA: usa HTTP POST ao testServer (porta 3004) que tem acesso ao
 * adapter do bot em execução. O delete é executado no processo do bot via
 * adapter.sendMessage com opção delete.
 */

import { isProtectedTarget } from '../src/services/permissions';
import logger from '../src/services/loggerService';
import fs from 'fs';
import path from 'path';

// ─── Configuração ────────────────────────────────────────────────────────────

const DISCOVERY_FILE = path.join(process.cwd(), 'laboratorio', 'casino-message-discovery.json');
const OUTPUT_DIR = path.join(process.cwd(), 'laboratorio');
const RESULT_FILE = path.join(OUTPUT_DIR, 'casino-delete-result.json');
const TEST_SERVER = 'http://127.0.0.1:3004';

interface DiscoveryData {
  foundAt: string;
  groupName: string;
  messageId: string;
  senderJid: string;
  participant: string;
  pushName: string;
  remoteJid: string;
  timestamp: number;
  contentType: string;
  messageType: any;
  messageKeys: string[];
  keyKeys: string[];
  payloadSize: number;
  signals: string[];
  detected: boolean;
  reason: string;
  rawPayloadSafe: Record<string, any>;
}

// ─── HTTP helper ────────────────────────────────────────────────────────────

function httpPost(url: string, data: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const body = JSON.stringify(data);
    const req = (parsed.protocol === 'https:' ? require('https') : require('http'))
      .request({
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      }, (res: any) => {
        let responseBody = '';
        res.on('data', (chunk: any) => { responseBody += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(responseBody);
            if (res.statusCode !== 200) {
              reject(new Error(`HTTP ${res.statusCode}: ${parsed.error || 'unknown error'}`));
            } else {
              resolve(parsed);
            }
          } catch {
            reject(new Error(`HTTP ${res.statusCode}: cannot parse response`));
          }
        });
      });
    req.on('error', (err: any) => reject(err));
    req.write(body);
    req.end();
  });
}

// ─── Leitura do discovery ────────────────────────────────────────────────────

function loadDiscovery(): DiscoveryData | null {
  try {
    if (!fs.existsSync(DISCOVERY_FILE)) {
      logger.error(`[CASINO-DELETE] arquivo de discovery não encontrado: ${DISCOVERY_FILE}`);
      logger.error('[CASINO-DELETE] execute primeiro: node dist/laboratorio/find-casino-message.js');
      return null;
    }
    const raw = fs.readFileSync(DISCOVERY_FILE, 'utf-8');
    const data = JSON.parse(raw) as DiscoveryData;
    logger.info(`[CASINO-DELETE] discovery carregado: ${data.messageId} em ${data.groupName}`);
    return data;
  } catch (err: any) {
    logger.error(`[CASINO-DELETE] erro ao ler discovery: ${err?.message}`);
    return null;
  }
}

// ─── Validação do alvo ──────────────────────────────────────────────────────

function validateTarget(data: DiscoveryData): { valid: boolean; error?: string } {
  // 1. Verificar alvo protegido
  const BOT_JID = '5585981344211@s.whatsapp.net';
  const OWNER_JID = '5588998314322@c.us';
  const OWNER_ALIASES = [
    '5588998314322@c.us',
    '5588998314322@s.whatsapp.net',
    '88998314322@c.us',
    '8898314322@c.us',
  ];

  const targetJid = data.participant || data.senderJid;

  // Normaliza para comparação
  const cleanTarget = (targetJid || '').replace(/@.*$/, '').replace(/^\+/, '');
  const cleanBot = BOT_JID.replace(/@.*$/, '').replace(/^\+/, '');
  const cleanOwner = OWNER_JID.replace(/@.*$/, '').replace(/^\+/, '');

  logger.info(`[CASINO-DELETE] validando alvo: ${targetJid}`);
  logger.info(`[CASINO-DELETE] comparando com BOT: ${cleanBot} → ${cleanTarget === cleanBot}`);
  logger.info(`[CASINO-DELETE] comparando com OWNER: ${cleanOwner} → ${cleanTarget === cleanOwner}`);

  if (cleanTarget === cleanBot) {
    return { valid: false, error: `ALVO É O PRÓPRIO BOT: ${targetJid}` };
  }

  if (cleanTarget === cleanOwner || OWNER_ALIASES.some((a) => a.replace(/@.*$/, '') === cleanTarget)) {
    return { valid: false, error: `ALVO É O DONO: ${targetJid}` };
  }

  // 2. Verificar se o isProtectedTarget também bloqueia
  if (isProtectedTarget(targetJid)) {
    return { valid: false, error: `isProtectedTarget bloqueou: ${targetJid}` };
  }

  logger.info(`[CASINO-DELETE] validação aprovada: ${targetJid} não é bot nem dono`);
  return { valid: true };
}

// ─── Execução do delete via testServer ──────────────────────────────────────

async function executeDeleteViaApi(
  groupJid: string,
  messageId: string,
  participant: string,
): Promise<{ success: boolean; error?: string; result?: any }> {
  try {
    const response = await httpPost(`${TEST_SERVER}/lab/delete-message`, {
      platform: 'whatsapp',
      groupJid: groupJid,
      messageId: messageId,
      participant: participant,
      fromMe: false,
    });
    return { success: true, result: response };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ─── Salva resultado ─────────────────────────────────────────────────────────

function saveResult(
  discovery: DiscoveryData,
  result: { success: boolean; error?: string; result?: any },
): void {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const entry = {
    executedAt: new Date().toISOString(),
    discovery: {
      foundAt: discovery.foundAt,
      messageId: discovery.messageId,
      participant: discovery.participant,
      pushName: discovery.pushName,
      remoteJid: discovery.remoteJid,
      timestamp: discovery.timestamp,
      contentType: discovery.contentType,
      signals: discovery.signals,
      detected: discovery.detected,
    },
    validation: {
      targetJid: discovery.participant || discovery.senderJid,
      isProtectedTarget: isProtectedTarget(discovery.participant || discovery.senderJid),
    },
    delete: result,
  };

  fs.writeFileSync(RESULT_FILE, JSON.stringify(entry, null, 2), 'utf-8');
  logger.info(`[CASINO-DELETE] resultado salvo em ${RESULT_FILE}`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  logger.info('[CASINO-DELETE] ════════════════════════════════════════════════');
  logger.info('[CASINO-DELETE] INICIANDO DELETE EXPERIMENTAL');
  logger.info('[CASINO-DELETE] ════════════════════════════════════════════════');

  // 1. Carregar discovery
  const discovery = loadDiscovery();
  if (!discovery) {
    logger.error('[CASINO-DELETE] ABORT: discovery não disponível');
    process.exit(1);
  }

  // 2. Validar alvo
  const validation = validateTarget(discovery);
  if (!validation.valid) {
    logger.error(`[CASINO-DELETE] ABORT: ${validation.error}`);
    saveResult(discovery, {
      success: false,
      error: validation.error,
      result: undefined,
    });
    process.exit(1);
  }

  // 3. Executar delete via testServer API
  const { messageId, participant, remoteJid } = discovery;

  logger.info('[CASINO-DELETE] ════════════════════════════════════════════════');
  logger.info('[CASINO-DELETE] EXECUTANDO DELETE...');
  logger.info('[CASINO-DELETE] ════════════════════════════════════════════════');

  const deleteResult = await executeDeleteViaApi(remoteJid, messageId, participant);

  // 4. Salvar resultado
  saveResult(discovery, deleteResult);

  // 5. Exibir resultado final
  logger.info('[CASINO-DELETE] ════════════════════════════════════════════════');
  if (deleteResult.success) {
    logger.info('[CASINO-DELETE] ✅ DELETE SUCCESS');
    logger.info(`[CASINO-DELETE] Mensagem: ${messageId}`);
    logger.info(`[CASINO-DELETE] Grupo: ${remoteJid}`);
    logger.info(`[CASINO-DELETE] Alvo: ${participant}`);
    logger.info(`[CASINO-DELETE] Resultado: ${JSON.stringify(deleteResult.result)}`);
  } else {
    logger.info('[CASINO-DELETE] ❌ DELETE FAILED');
    logger.info(`[CASINO-DELETE] Mensagem: ${messageId}`);
    logger.info(`[CASINO-DELETE] Grupo: ${remoteJid}`);
    logger.info(`[CASINO-DELETE] Alvo: ${participant}`);
    logger.info(`[CASINO-DELETE] Erro: ${deleteResult.error}`);
  }
  logger.info('[CASINO-DELETE] ════════════════════════════════════════════════');
  logger.info(`[CASINO-DELETE] Resultado salvo: ${RESULT_FILE}`);
  logger.info('[CASINO-DELETE] ════════════════════════════════════════════════');
}

main().catch((err: any) => {
  logger.error(`[CASINO-DELETE] erro fatal: ${err?.message || err}`);
  process.exit(1);
});
