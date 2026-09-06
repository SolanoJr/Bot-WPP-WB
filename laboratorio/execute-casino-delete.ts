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
 * PRÊ-REQUISITOS:
 *   - laboratorio/casino-message-discovery.json existente (executado find-casino-message.ts)
 *   - Bot online e conectado
 */

import { BaileysAdapter } from '../src/platforms/whatsapp/BaileysAdapter';
import { PlatformManager } from '../src/platforms/PlatformManager';
import { isProtectedTarget } from '../src/services/permissions';
import logger from '../src/services/loggerService';
import fs from 'fs';
import path from 'path';

// ─── Configuração ────────────────────────────────────────────────────────────

const DISCOVERY_FILE = path.join(process.cwd(), 'laboratorio', 'casino-message-discovery.json');
const OUTPUT_DIR = path.join(process.cwd(), 'laboratorio');
const RESULT_FILE = path.join(OUTPUT_DIR, 'casino-delete-result.json');

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

// ─── Execução do delete ─────────────────────────────────────────────────────

async function executeDelete(
  adapter: any,
  data: DiscoveryData,
): Promise<{ success: boolean; error?: string; details: Record<string, any> }> {
  const { messageId, participant, remoteJid, timestamp } = data;

  const messageKey = {
    id: messageId,
    fromMe: false,
    participant: participant || remoteJid,
    remoteJid: remoteJid,
  };

  logger.info(`[CASINO-DELETE] iniciando delete de: ${JSON.stringify({ id: messageId, participant, remoteJid })}`);
  logger.info(`[CASINO-DELETE] messageKey: ${JSON.stringify(messageKey)}`);
  logger.info(`[CASINO-DELETE] timestamp da mensagem: ${new Date(timestamp).toISOString()}`);

  const startTime = Date.now();

  try {
    // Usar a API existente do Baileys para delete
    // sendMessage(jid, '', { delete: { id, fromMe, participant } })
    const result = await adapter.sendMessage(remoteJid, '', {
      delete: {
        id: messageKey.id,
        fromMe: messageKey.fromMe,
        participant: messageKey.participant,
      },
    });

    const duration = Date.now() - startTime;

    logger.info(`[CASINO-DELETE] delete executado com sucesso`);
    logger.info(`[CASINO-DELETE] duration: ${duration}ms`);
    logger.info(`[CASINO-DELETE] result: ${JSON.stringify(result)}`);

    return {
      success: true,
      details: {
        messageId: data.messageId,
        participant: data.participant,
        remoteJid: data.remoteJid,
        timestamp: data.timestamp,
        method: 'adapter.sendMessage with delete option',
        messageKey: {
          id: messageKey.id,
          fromMe: messageKey.fromMe,
          participant: messageKey.participant,
          remoteJid: messageKey.remoteJid,
        },
        result: result,
        durationMs: duration,
        timestampExecuted: Date.now(),
        correlationId: Math.random().toString(36).slice(2),
      },
    };
  } catch (err: any) {
    const duration = Date.now() - startTime;
    const errorMsg = err?.message || String(err);
    const errorStack = err?.stack || '';

    logger.error(`[CASINO-DELETE] delete FALHOU`);
    logger.error(`[CASINO-DELETE] erro: ${errorMsg}`);
    logger.error(`[CASINO-DELETE] duration: ${duration}ms`);
    logger.error(`[CASINO-DELETE] stack: ${errorStack?.slice(0, 500)}`);

    return {
      success: false,
      error: errorMsg,
      details: {
        messageId: data.messageId,
        participant: data.participant,
        remoteJid: data.remoteJid,
        timestamp: data.timestamp,
        method: 'adapter.sendMessage with delete option',
        messageKey: {
          id: messageKey.id,
          fromMe: messageKey.fromMe,
          participant: messageKey.participant,
          remoteJid: messageKey.remoteJid,
        },
        error: errorMsg,
        errorStack: errorStack?.slice(0, 2000),
        durationMs: duration,
        timestampExecuted: Date.now(),
        correlationId: Math.random().toString(36).slice(2),
      },
    };
  }
}

// ─── Salva resultado ─────────────────────────────────────────────────────────

function saveResult(
  discovery: DiscoveryData,
  result: { success: boolean; error?: string; details: Record<string, any> },
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
    // Salva resultado mesmo em falha
    saveResult(discovery, {
      success: false,
      error: validation.error,
      details: {
        messageId: discovery.messageId,
        participant: discovery.participant,
        remoteJid: discovery.remoteJid,
        error: validation.error,
        timestampExecuted: Date.now(),
      },
    });
    process.exit(1);
  }

  // 3. Obter adapter — safe cast para BaileysAdapter
  const pm = PlatformManager.getInstance();
  const rawAdapter = pm.getAdapter('whatsapp');
  if (!rawAdapter || typeof (rawAdapter as any).sendMessage !== 'function') {
    const error = 'adapter whatsapp não encontrado ou inválido (sem sendMessage)';
    logger.error(`[CASINO-DELETE] ABORT: ${error}`);
    saveResult(discovery, {
      success: false,
      error,
      details: {
        messageId: discovery.messageId,
        participant: discovery.participant,
        remoteJid: discovery.remoteJid,
        error,
        timestampExecuted: Date.now(),
      },
    });
    process.exit(1);
  }
  const adapter = rawAdapter as any;

  // 4. Executar delete
  logger.info(`[CASINO-DELETE] ════════════════════════════════════════════════`);
  logger.info(`[CASINO-DELETE] EXECUTANDO DELETE...`);
  logger.info(`[CASINO-DELETE] ════════════════════════════════════════════════`);

  const result = await executeDelete(adapter, discovery);

  // 5. Salvar resultado
  saveResult(discovery, result);

  // 6. Exibir resultado final
  logger.info(`[CASINO-DELETE] ════════════════════════════════════════════════`);
  if (result.success) {
    logger.info(`[CASINO-DELETE] ✅ DELETE SUCCESS`);
    logger.info(`[CASINO-DELETE] Mensagem: ${discovery.messageId}`);
    logger.info(`[CASINO-DELETE] Grupo: ${discovery.remoteJid}`);
    logger.info(`[CASINO-DELETE] Alvo: ${discovery.participant}`);
    logger.info(`[CASINO-DELETE] Método: ${result.details.method}`);
    logger.info(`[CASINO-DELETE] Duração: ${result.details.durationMs}ms`);
  } else {
    logger.info(`[CASINO-DELETE] ❌ DELETE FAILED`);
    logger.info(`[CASINO-DELETE] Mensagem: ${discovery.messageId}`);
    logger.info(`[CASINO-DELETE] Grupo: ${discovery.remoteJid}`);
    logger.info(`[CASINO-DELETE] Alvo: ${discovery.participant}`);
    logger.info(`[CASINO-DELETE] Erro: ${result.error}`);
    logger.info(`[CASINO-DELETE] Stack: ${result.details.errorStack?.slice(0, 200) || 'N/A'}`);
  }
  logger.info(`[CASINO-DELETE] ════════════════════════════════════════════════`);
  logger.info(`[CASINO-DELETE] Resultado salvo: ${RESULT_FILE}`);
  logger.info(`[CASINO-DELETE] ════════════════════════════════════════════════`);
}

main().catch((err: any) => {
  logger.error(`[CASINO-DELETE] erro fatal: ${err?.message || err}`);
  process.exit(1);
});
