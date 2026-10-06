type TargetKey = {
  id: string;
  remoteJid: string;
};

export interface DeleteConfirmation {
  type: 'messages.update' | 'messages.delete';
  targetId: string;
  remoteJid: string;
  protocolMessageType?: string;
}

function matchesTarget(candidate: any, target: TargetKey): boolean {
  return candidate?.id === target.id && candidate?.remoteJid === target.remoteJid;
}

export function matchDeleteRevoke(target: TargetKey, updates: any): DeleteConfirmation | null {
  const items = Array.isArray(updates) ? updates : [updates];
  for (const update of items) {
    const protocol = update?.message?.protocolMessage || update?.update?.message?.protocolMessage;
    if (protocol?.type !== 'REVOKE') continue;
    const revokedKey = protocol.key || update?.key;
    if (!matchesTarget(revokedKey, target)) continue;
    return {
      type: 'messages.update',
      targetId: target.id,
      remoteJid: target.remoteJid,
      protocolMessageType: 'REVOKE',
    };
  }
  return null;
}

export function matchMessagesDelete(target: TargetKey, event: any): DeleteConfirmation | null {
  const key = event?.keys?.find((candidate: any) => matchesTarget(candidate, target));
  if (!key) return null;
  return {
    type: 'messages.delete',
    targetId: target.id,
    remoteJid: target.remoteJid,
  };
}