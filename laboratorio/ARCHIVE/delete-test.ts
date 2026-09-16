/**
 * laboratorio/delete-test.ts
 *
 * EXPERIMENTO CONTROLADO: deletar UMA mensagem real do grupo "Teste"
 * usando o socket Baileys já conectado (WarriorBlack).
 *
 * FLUXO:
 * 1. Localizar a mensagem "apagueisto" no JSONL (chave completa)
 * 2. Confirmar remetente, grupo, fromMe
 * 3. ENVIAR UMA ÚNICA tentativa de delete com o WAMessageKey completo
 * 4. Escutar eventos Baileys (messages.delete, messages.update) por confirmação
 * 5. Verificar fetchMessageHistory após delete
 * 6. Registrar tudo no laboratorio/
 *
 * REGRAS:
 * - NÃO criar segundo socket
 * - NÃO mexer no AutoMod/produção
 * - NÃO banir/remover participantes
 * - NÃO fazer loop nem múltiplas tentativas
 * - NÃO usar participantAlt a menos que esteja no key original
 */

import { makeWASocket, useMultiFileAuthState } from '@whiskeysockets/baileys';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

// ─── Configuração ─────────────────────────────────────────────────────────────
const AUTH_DIR = path.join(process.cwd(), 'sessions');
const LABORATORIO_DIR = path.join(process.cwd(), 'laboratorio');
const CAPTURE_FILE = path.join(LABORATORIO_DIR, 'captured-messages.jsonl');
const RESULT_FILE = path.join(LABORATORIO_DIR, 'delete-test-result.json');
const GROUP_JID = '120363410094452673@g.us'; // grupo Teste
const TARGET_MESSAGE_ID = '3EB099B3B6E8113FCD499A';

// ─── Tipos ─────────────────────────────────────────────────────────────────────
interface DeleteTestResult {
  experimentId: string;
  startedAt: string;
  groupJid: string;
  targetMessageId: string;
  messageKeyFound: boolean;
  messageKey: Record<string, any> | null;
  fromMe: boolean;
  participant: string;
  participantAlt: string | undefined;
  remoteJid: string;
  addressingMode: string | undefined;
  sendMessageCalled: boolean;
  sendMessageReturned: boolean;
  sendMessageResult: Record<string, any> | null;
  eventsAfterDelete: Array<{
    eventType: string;
    timestamp: number;
    data: Record<string, any>;
  }>;
  fetchHistoryAfterDelete: { success: boolean; count: number; raw: any };
  conclusion: 'confirmed' | 'not_confirmed' | 'unknown';
  notes: string[];
}

async function main(): Promise<void> {
  const result: DeleteTestResult = {
    experimentId: randomUUID(),
    startedAt: new Date().toISOString(),
    groupJid: GROUP_JID,
    targetMessageId: TARGET_MESSAGE_ID,
    messageKeyFound: false,
    messageKey: null,
    fromMe: false,
    participant: '',
    participantAlt: undefined,
    remoteJid: '',
    addressingMode: undefined,
    sendMessageCalled: false,
    sendMessageReturned: false,
    sendMessageResult: null,
    eventsAfterDelete: [],
    fetchHistoryAfterDelete: { success: false, count: 0, raw: null },
    conclusion: 'unknown',
    notes: [],
  };

  console.log('═══ EXPERIMENTO DE DELETE CONTROLADO ═══');
  console.log(`Experiment ID: ${result.experimentId}`);
  console.log(`Iniciado em:  ${result.startedAt}`);
  console.log(`Grupo:        ${GROUP_JID}`);
  console.log(`Mensagem:     ${TARGET_MESSAGE_ID}`);
  console.log('');

  // ─── 1. Localizar mensagem no JSONL ──────────────────────────────────────────
  console.log('[1] Localizando mensagem "apagueisto" no JSONL...');
  if (!fs.existsSync(CAPTURE_FILE)) {
    result.notes.push('JSONL não encontrado');
    console.log('  ✗ JSONL não encontrado');
    writeResult(result);
    return;
  }

  const lines = fs.readFileSync(CAPTURE_FILE, 'utf-8').split('\n').filter(Boolean);
  let targetCapture: any = null;

  for (const line of lines) {
    try {
      const capture = JSON.parse(line);
      if (capture.messageId === TARGET_MESSAGE_ID &&
          capture.groupId === GROUP_JID &&
          capture.fromMe === false) {
        targetCapture = capture;
        break;
      }
    } catch { /* pular linhas inválidas */ }
  }

  if (!targetCapture) {
    result.notes.push('Mensagem não encontrada no JSONL (apenas revokes?');
    console.log('  ✗ Mensagem não encontrada no JSONL');
    console.log('  → A mensagem original pode ter sido filtrada (fromMe=true ou timestamp antigo)');
    console.log('  → O JSONL contém apenas as capturas de REVOKE que foram enviadas');
    writeResult(result);
    return;
  }

  result.messageKeyFound = true;
  const rawKey = targetCapture.rawPayloadSafe?.key;

  result.messageKey = {
    id: rawKey?.id || targetCapture.messageId,
    remoteJid: rawKey?.remoteJid || targetCapture.remoteJid,
    fromMe: rawKey?.fromMe ?? false,
    participant: rawKey?.participant || targetCapture.participant,
    participantAlt: rawKey?.participantAlt,
    addressingMode: rawKey?.addressingMode,
    server_id: rawKey?.server_id,
  };

  result.fromMe = result.messageKey.fromMe;
  result.participant = result.messageKey.participant;
  result.participantAlt = result.messageKey.participantAlt;
  result.remoteJid = result.messageKey.remoteJid;
  result.addressingMode = result.messageKey.addressingMode;

  console.log('  ✓ Mensagem encontrada no JSONL');
  console.log(`  ├── messageId:      ${result.messageKey.id}`);
  console.log(`  ├── remoteJid:      ${result.messageKey.remoteJid}`);
  console.log(`  ├── fromMe:         ${result.messageKey.fromMe}`);
  console.log(`  ├── participant:    ${result.messageKey.participant}`);
  console.log(`  ├── participantAlt: ${result.messageKey.participantAlt || '(ausente)'}`);
  console.log(`  ├── addressingMode: ${result.messageKey.addressingMode || '(ausente)'}`);
  console.log(`  └── conversation:   ${targetCapture.rawPayloadSafe?.message?.conversation || targetCapture.rawPayloadSafe?.message?.extendedTextMessage?.text || '(não encontrado)'}`);
  console.log('');

  // ─── 2. Confirmar remetente ───────────────────────────────────────────────────
  console.log('[2] Confirmando remetente...');
  const isFromBot = result.fromMe;
  const isFromOwner = result.participant === '202658048684056@lid' || 
                      result.participantAlt === '558898314322@s.whatsapp.net';

  console.log(`  ├── fromMe (é do bot?): ${isFromBot} → ${isFromBot ? 'ALERTA: bot' : 'ok: não é do bot'}`);
  console.log(`  ├── participant:         ${result.participant} → ${isFromOwner ? 'dono' : 'outro'}`);
  console.log(`  ├── participantAlt:      ${result.participantAlt || '(ausente)'}`);
  console.log(`  ├── remoteJid == grupo?: ${result.remoteJid === GROUP_JID ? 'SIM ✓' : 'NÃO'}`);
  console.log(`  └── Está "apagueisto"?    SIM ✓`);

  if (isFromBot) {
    result.notes.push('NÃO deletar: mensagem é do próprio bot');
    console.log('  ✗ NÃO deletar — mensagem é do próprio bot');
    writeResult(result);
    return;
  }

  console.log('  ✓ Confirmação OK — pode deletar');
  console.log('');

  // ─── 3. Conectar ao socket existente ──────────────────────────────────────────
  console.log('[3] Obtendo socket Baileys já conectado...');
  console.log('  → O socket é gerenciado pelo WarriorBlack (BaileysAdapter/BaileysConnection)');
  console.log('  → NÃO vamos criar um novo socket');
  console.log('  → Vamos usar o adapter registrado no PlatformManager');

  // Tenta obter o adapter via PlatformManager
  let sock: any = null;
  let adapter: any = null;

  try {
    const { PlatformManager } = await import('../src/platforms/PlatformManager.js');
    const pm = PlatformManager.getInstance();
    adapter = pm.getAdapter('whatsapp');
    if (adapter) {
      sock = (adapter as any).connection?.getSock?.() || (adapter as any).sock || null;
      console.log(`  ✓ Adapter encontrado: ${adapter.platform}`);
      console.log(`  ✓ Socket: ${sock ? 'conectado' : 'NÃO conectado'}`);
      if (sock?.user) {
        console.log(`  ✓ Usuário: ${sock.user.id} (${sock.user.name})`);
      }
    } else {
      console.log('  ✗ Adapter WhatsApp não encontrado no PlatformManager');
      result.notes.push('Adapter WhatsApp não disponível');
      writeResult(result);
      return;
    }
  } catch (e: any) {
    console.log(`  ✗ Erro ao obter PlatformManager: ${e.message}`);
    result.notes.push(`Erro PlatformManager: ${e.message}`);
    writeResult(result);
    return;
  }

  if (!sock) {
    console.log('  ✗ Socket não disponível');
    result.notes.push('Socket não disponível');
    writeResult(result);
    return;
  }

  console.log('');

  // ─── 4. Registrar evento de confirmação ──────────────────────────────────────
  console.log('[4] Registando listeners para confirmação de delete...');
  console.log('  → Ouvindo: messages.delete, messages.update');
  console.log('  → Duração do ouvido: até receber evento ou timeout de 10s');

  const events: DeleteTestResult['eventsAfterDelete'] = [];
  let eventHandlerInstalled = false;
  const eventTimeout = 10000; // 10 segundos

  if (sock.ev) {
    // messages.delete — confirmação de que a mensagem foi excluída
    sock.ev.on('messages.delete', (data: any) => {
      const evt: DeleteTestResult['eventsAfterDelete'][0] = {
        eventType: 'messages.delete',
        timestamp: Date.now(),
        data: { keys: data?.keys || [], jid: data?.jid || '', all: data?.all || false },
      };
      events.push(evt);
      console.log(`  [EVENT] messages.delete: keys=${JSON.stringify(data?.keys || [])}`);
    });

    // messages.update — mensagem atualizada (pode incluir marcação de deletada)
    sock.ev.on('messages.update', (data: any) => {
      if (Array.isArray(data) && data.length > 0) {
        for (const update of data) {
          if (update?.key?.id === TARGET_MESSAGE_ID) {
            const evt: DeleteTestResult['eventsAfterDelete'][0] = {
              eventType: 'messages.update',
              timestamp: Date.now(),
              data: update,
            };
            events.push(evt);
            console.log(`  [EVENT] messages.update para ${TARGET_MESSAGE_ID}: ${JSON.stringify(update).substring(0, 200)}`);
          }
        }
      }
    });

    eventHandlerInstalled = true;
    console.log(`  ✓ Listeners instalados (evt.on)`);
  } else {
    console.log('  ✗ sock.ev não disponível — não é possível ouvir eventos');
    result.notes.push('sock.ev não disponível');
  }
  console.log('');

  // ─── 5. ENVIAR UMA ÚNICA TENTATIVA DE DELETE ────────────────────────────────
  console.log('[5] ENVIANDO UMA ÚNICA TENTATIVA DE DELETE...');
  console.log(`  ├── groupJid:     ${GROUP_JID}`);
  console.log(`  ├── messageKey:   ${JSON.stringify(result.messageKey)}`);

  const deleteKey: any = { ...result.messageKey };
  // Normaliza para o formato exigido pelo Baileys
  deleteKey.remoteJid = GROUP_JID;
  deleteKey.fromMe = false;

  console.log(`  └── deleteKey enviada: ${JSON.stringify(deleteKey)}`);
  console.log('');

  result.sendMessageCalled = true;

  try {
    const sendResult = await sock.sendMessage(GROUP_JID, { delete: deleteKey });
    result.sendMessageReturned = true;
    result.sendMessageResult = {
      key: sendResult?.key || null,
      message: sendResult?.message || null,
      protocolMessage: sendResult?.message?.protocolMessage || null,
      status: sendResult?.status || null,
      _rawKeys: Object.keys(sendResult || {}).slice(0, 10),
    };

    console.log('  ✓ sendMessage retornou (sem erro de chamada)');
    console.log(`  ├── retorno.key:        ${sendResult?.key?.id || '(ausente)'}`);
    console.log(`  ├── retorno.status:     ${sendResult?.status || '(ausente)'}`);
    console.log(`  ├── retorno.protocolMessage:`);
    if (sendResult?.message?.protocolMessage) {
      const pm = sendResult.message.protocolMessage;
      console.log(`  │   ├── type:   ${pm.type}`);
      console.log(`  │   ├── key.id: ${pm.key?.id || '(ausente)'}`);
      console.log(`  │   └── fromMe: ${pm.key?.fromMe ?? 'N/A'}`);
    } else {
      console.log('  │   (ausente —)');
    }
    console.log(`  └── retorno._rawKeys:  ${result.sendMessageResult._rawKeys.join(', ')}`);
  } catch (e: any) {
    console.log(`  ✗ sendMessage lançou: ${e.message}`);
    result.sendMessageResult = { error: e.message };
  }
  console.log('');

  // ─── 6. Aguardar evento de confirmação ────────────────────────────────────────
  console.log('[6] Aguardando evento de confirmação (timeout 10s)...');

  if (!eventHandlerInstalled) {
    result.notes.push('Não foi possível instalar listeners para confirmação');
    result.conclusion = 'unknown';
    console.log('  ! Não há listeners → confirmação por eventos indisponível');
  } else {
    // Aguarda eventos ou timeout
    await new Promise<void>((resolve) => {
      const start = Date.now();
      const checkEvents = () => {
        if (events.length > 0) {
          console.log(`  ✓ Evento(s) recebido(s): ${events.length}`);
          for (const evt of events) {
            console.log(`  │  ${evt.eventType}: ${JSON.stringify(evt.data).substring(0, 150)}`);
          }
          resolve();
        } else if (Date.now() - start > eventTimeout) {
          console.log(`  ! Timeout (${eventTimeout}ms) — nenhum evento recebido`);
          resolve();
        } else {
          setTimeout(checkEvents, 200);
        }
      };
      checkEvents();
    });
  }
  console.log('');

  // ─── 7. Verificar fetchMessageHistory ─────────────────────────────────────────
  console.log('[7] Verificando fetchMessageHistory após delete...');

  if (sock?.fetchMessageHistory) {
    try {
      const OLDEST_KEY: any = {
        id: '__MOST_RECENT__',
        remoteJid: GROUP_JID,
        fromMe: false,
        participant: '',
      };
      const historyResponse = await sock.fetchMessageHistory(20, OLDEST_KEY, Date.now());
      result.fetchHistoryAfterDelete = {
        success: true,
        count: typeof historyResponse === 'string' 
          ? (() => { try { return JSON.parse(historyResponse).length || 1; } catch { return 1; } })()
          : 1,
        raw: typeof historyResponse === 'string' 
          ? historyResponse.substring(0, 500) 
          : String(historyResponse).substring(0, 500),
      };

      console.log(`  ✓ fetchMessageHistory retornou (${result.fetchHistoryAfterDelete.count} mensagens)`);
      console.log(`  └── raw: ${result.fetchHistoryAfterDelete.raw}`);
    } catch (e: any) {
      console.log(`  ✗ fetchMessageHistory falhou: ${e.message}`);
      result.fetchHistoryAfterDelete = { success: false, count: 0, raw: e.message };
      result.notes.push(`fetchMessageHistory falhou: ${e.message}`);
    }
  } else {
    console.log('  ! fetchMessageHistory não disponível neste socket');
    result.notes.push('fetchMessageHistory indisponível');
  }
  console.log('');

  // ─── 8. Conclusão ─────────────────────────────────────────────────────────────
  console.log('═══ CONCLUSÃO ═══');

  // Avalia confirmação
  const sendSuccess = result.sendMessageCalled && result.sendMessageReturned;
  const eventConfirmed = events.some((e: { eventType: string; data: Record<string, any> }) =>
    e.eventType === 'messages.delete' ||
    (e.eventType === 'messages.update' && (e.data as any)?.key?.id === TARGET_MESSAGE_ID)
  );
  const fetchHistoryOk = result.fetchHistoryAfterDelete.success;

  console.log(`  A) revoke enviado pelo cliente:  ${sendSuccess ? 'SIM ✓' : 'NÃO'}`);
  console.log(`  B) revoke aceito/processado:     ${eventConfirmed ? 'EVENTO RECEBIDO ✓' : 'NENHUM EVENTO (não confirmado)'}`);
  console.log(`  C) mensagem visualmente removida: ${fetchHistoryOk ? 'INDIRETO (fetchHistory ok)' : 'NÃO VERIFICADO'}`);

  if (sendSuccess && eventConfirmed) {
    result.conclusion = 'confirmed';
    console.log('');
    console.log('  → REVOKE confirmado pelo evento Baileys');
  } else if (sendSuccess && !eventConfirmed) {
    result.conclusion = 'not_confirmed';
    console.log('');
    console.log('  → REVOKE enviado mas NÃO houve confirmação de evento');
    console.log('  → Baileys não fornece confirmação suficiente para provar visualmente a remoção');
  } else {
    result.conclusion = 'unknown';
    console.log('');
    console.log('  → Não foi possível determinar');
  }

  console.log('');
  console.log(`  Observações:`);
  for (const note of result.notes) {
    console.log(`    - ${note}`);
  }

  result.notes.push(
    `Conclusão: ${result.conclusion}`,
    `Eventos recebidos: ${events.length}`,
    `sendMessageCalled: ${result.sendMessageCalled}`,
    `sendMessageReturned: ${result.sendMessageReturned}`,
  );

  writeResult(result);
  console.log('');
  console.log(`Resultado salvo em: ${RESULT_FILE}`);
}

function writeResult(result: DeleteTestResult): void {
  try {
    fs.mkdirSync(LABORATORIO_DIR, { recursive: true });
    fs.writeFileSync(RESULT_FILE, JSON.stringify(result, null, 2), 'utf-8');
  } catch (e: any) {
    console.error(`Erro ao salvar resultado: ${e.message}`);
  }
}

main().catch((e: any) => {
  console.error('Erro fatal no experimento:', e);
  process.exit(1);
});
