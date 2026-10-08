import {
  createDeleteConfirmationWaiter,
  type DeleteConfirmation,
  type TargetKey,
} from './deleteE2EConfirmation';

export interface DeleteRequest {
  platform: 'whatsapp';
  chatId: string;
  targetKey: TargetKey;
  correlationId: string;
  timeoutMs?: number;
  sock: any;
  /** Envia exatamente uma solicitação ao adapter/Baileys. */
  sendDelete: () => Promise<any>;
}

export interface DeleteOutcome {
  requested: boolean;
  accepted: boolean;
  confirmed: boolean;
  finalState: 'PASS' | 'FAIL' | 'TIMEOUT';
  confirmation?: DeleteConfirmation;
  error?: string;
}

function validateRequest(request: DeleteRequest): string | null {
  if (request.platform !== 'whatsapp') return 'Plataforma não suportada para confirmação de delete';
  if (!request.chatId) return 'chatId ausente';
  if (!request.correlationId) return 'correlationId ausente';
  if (!request.sock?.ev?.on || !request.sock?.ev?.off) return 'socket Baileys sem event emitter';
  if (!request.targetKey?.id || !request.targetKey?.remoteJid) return 'WAMessageKey sem id ou remoteJid';
  if (typeof request.sendDelete !== 'function') return 'sendDelete ausente';
  return null;
}

/**
 * Solicita exatamente um delete e aguarda evidência correlacionada do Baileys.
 * Promise resolvida/status do adapter significam somente aceitação, nunca confirmação.
 */
export async function requestConfirmedDelete(request: DeleteRequest): Promise<DeleteOutcome> {
  const validationError = validateRequest(request);
  if (validationError) {
    return { requested: false, accepted: false, confirmed: false, finalState: 'FAIL', error: validationError };
  }

  const waiter = createDeleteConfirmationWaiter(
    request.sock,
    request.targetKey,
    request.correlationId,
    request.timeoutMs ?? 10_000,
  );

  let requested = false;
  try {
    requested = true;
    const response = await request.sendDelete();
    // O BaileysMessageSender retorna um PlatformMessage. null/undefined é falha
    // do wrapper e nunca pode ser tratado como aceitação.
    if (response === null || response === undefined) {
      waiter.dispose();
      return {
        requested: true,
        accepted: false,
        confirmed: false,
        finalState: 'FAIL',
        error: 'Adapter não aceitou a solicitação de delete',
      };
    }

    const confirmation = await waiter.promise;
    const timedOut = waiter.didTimeout();
    waiter.dispose();
    if (confirmation) {
      return { requested: true, accepted: true, confirmed: true, finalState: 'PASS', confirmation };
    }
    return {
      requested: true,
      accepted: true,
      confirmed: false,
      finalState: timedOut ? 'TIMEOUT' : 'FAIL',
      error: timedOut ? 'Nenhuma confirmação real dentro da janela' : 'Confirmação encerrada sem evidência correlacionada',
    };
  } catch (err: any) {
    waiter.dispose();
    return {
      requested,
      accepted: false,
      confirmed: false,
      finalState: 'FAIL',
      error: err?.message || String(err),
    };
  }
}
