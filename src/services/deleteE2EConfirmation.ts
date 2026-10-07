export type DeleteConfirmationSource = 'messages.upsert' | 'messages.update' | 'messages.delete';

export type TargetKey = {
  id: string;
  remoteJid: string;
  fromMe?: boolean;
  participant?: string;
  participantAlt?: string;
  remoteJidAlt?: string;
  addressingMode?: string;
  [key: string]: unknown;
};

export interface DeleteConfirmation {
  type: DeleteConfirmationSource;
  confirmationSource: DeleteConfirmationSource;
  targetId: string;
  remoteJid: string;
  protocolMessageType?: 'REVOKE';
  envelopeMessageId?: string | null;
  targetKey?: TargetKey;
  timestamp: number;
}

/** WAProto.ProtocolMessage.Type.REVOKE in @whiskeysockets/baileys. */
export const REVOKE_PROTOCOL_TYPE = 0 as const;

function isRevokeType(type: unknown): boolean {
  return type === REVOKE_PROTOCOL_TYPE || type === 'REVOKE' || type === '0';
}

function matchesTarget(candidate: any, target: TargetKey): boolean {
  if (!candidate || candidate.id !== target.id || candidate.remoteJid !== target.remoteJid) return false;
  if (typeof target.fromMe === 'boolean' && typeof candidate.fromMe === 'boolean' && candidate.fromMe !== target.fromMe) {
    return false;
  }
  return true;
}

function targetKeyFrom(candidate: any): TargetKey | undefined {
  if (!candidate?.id || !candidate?.remoteJid) return undefined;
  return candidate as TargetKey;
}

function confirmation(
  source: DeleteConfirmationSource,
  target: TargetKey,
  details: Partial<DeleteConfirmation> = {},
): DeleteConfirmation {
  return {
    type: source,
    confirmationSource: source,
    targetId: target.id,
    remoteJid: target.remoteJid,
    timestamp: Date.now(),
    ...details,
  };
}

export function matchMessagesUpsert(target: TargetKey, event: any): DeleteConfirmation | null {
  const items = Array.isArray(event?.messages) ? event.messages : (Array.isArray(event) ? event : [event]);
  for (const message of items) {
    const protocol = message?.message?.protocolMessage;
    if (!isRevokeType(protocol?.type)) continue;
    const revokedKey = targetKeyFrom(protocol.key);
    if (!revokedKey || !matchesTarget(revokedKey, target)) continue;
    return confirmation('messages.upsert', target, {
      protocolMessageType: 'REVOKE',
      envelopeMessageId: message?.key?.id || null,
      targetKey: revokedKey,
      timestamp: Number(message?.messageTimestamp) || Date.now(),
    });
  }
  return null;
}

export function matchDeleteRevoke(target: TargetKey, updates: any): DeleteConfirmation | null {
  const items = Array.isArray(updates) ? updates : [updates];
  for (const update of items) {
    const protocol = update?.message?.protocolMessage || update?.update?.message?.protocolMessage;
    if (!isRevokeType(protocol?.type)) continue;
    const revokedKey = targetKeyFrom(protocol.key || update?.key);
    if (!revokedKey || !matchesTarget(revokedKey, target)) continue;
    return confirmation('messages.update', target, {
      protocolMessageType: 'REVOKE',
      envelopeMessageId: update?.key?.id || update?.id || null,
      targetKey: revokedKey,
    });
  }
  return null;
}

export function matchMessagesDelete(target: TargetKey, event: any): DeleteConfirmation | null {
  const key = event?.keys?.find((candidate: any) => matchesTarget(candidate, target));
  if (!key) return null;
  return confirmation('messages.delete', target, {
    envelopeMessageId: key?.id || null,
    targetKey: key,
  });
}

export function matchDeleteConfirmation(target: TargetKey, source: DeleteConfirmationSource, event: any): DeleteConfirmation | null {
  if (source === 'messages.upsert') return matchMessagesUpsert(target, event);
  if (source === 'messages.update') return matchDeleteRevoke(target, event);
  return matchMessagesDelete(target, event);
}

export function createDeleteConfirmationWaiter(sock: any, target: TargetKey, correlationId: string, timeoutMs: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let settled = false;
  let timedOut = false;
  let resolvePromise: (confirmation: DeleteConfirmation | null) => void = () => {};
  const cleanup = () => {
    if (timer) clearTimeout(timer);
    sock.ev.off('messages.upsert', onUpsert);
    sock.ev.off('messages.update', onUpdate);
    sock.ev.off('messages.delete', onDelete);
  };
  const finish = (matched: DeleteConfirmation | null) => {
    if (settled) return;
    settled = true;
    cleanup();
    resolvePromise(matched ? { ...matched, correlationId } as DeleteConfirmation & { correlationId: string } : null);
  };
  const onUpsert = (event: any) => {
    const matched = matchMessagesUpsert(target, event);
    if (matched) finish(matched);
  };
  const onUpdate = (event: any) => {
    const matched = matchDeleteRevoke(target, event);
    if (matched) finish(matched);
  };
  const onDelete = (event: any) => {
    const matched = matchMessagesDelete(target, event);
    if (matched) finish(matched);
  };
  const promise = new Promise<DeleteConfirmation | null>((resolve) => { resolvePromise = resolve; });
  sock.ev.on('messages.upsert', onUpsert);
  sock.ev.on('messages.update', onUpdate);
  sock.ev.on('messages.delete', onDelete);
  timer = setTimeout(() => { timedOut = true; finish(null); }, timeoutMs);
  return {
    promise,
    dispose: () => finish(null),
    didTimeout: () => timedOut,
  };
}
