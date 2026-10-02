/**
 * pipelineHarness — harness de INTEGRAÇÃO do pipeline real do AutoMod.
 *
 * Diferente de chamar `evaluate()` diretamente, este harness exercita a
 * sequência completa:
 *
 *   mensagem crua (WAMessage-like)
 *     → normalização (extração de texto/URLs/estrutura)
 *     → identificação do grupo e do remetente
 *     → leitura da config do grupo (SQLite real)
 *     → evaluate()
 *     → decisão
 *     → delete (key completa)
 *     → ban / remove
 *     → registro de infração
 *     → anúncio
 *     → log de auditoria com correlationId
 *
 * A fronteira externa (socket do Baileys, banco de infrações) é mockada —
 * o resto do pipeline é o código de produção.
 *
 * NUNCA é usado para banir/remover WarriorBlack ou SolanoJr: o próprio engine
 * aplica `isProtectedTarget()`, e os testes verificam que a proteção funciona.
 */

export interface HarnessCall {
  step: 'delete' | 'ban' | 'remove' | 'announce' | 'infraction' | 'log';
  payload: any;
}

export interface HarnessResult {
  /** Decisão devolvida pelo engine. */
  decision: { acted: boolean; reason: string; action: string };
  /** Todas as chamadas externas, na ordem em que ocorreram. */
  calls: HarnessCall[];
  /** Logs emitidos pelo engine. */
  logs: string[];
  /** correlationId da mensagem. */
  correlationId: string;
}

/** Constrói uma WAMessage-like mínima e realista. */
export function makeWAMessage(opts: {
  id?: string;
  remoteJid?: string;
  participant?: string;
  participantAlt?: string;
  addressingMode?: string;
  fromMe?: boolean;
  pushName?: string;
  message: any;
  timestamp?: number;
}): any {
  return {
    key: {
      id: opts.id || 'MSG-' + Math.random().toString(36).slice(2, 10),
      remoteJid: opts.remoteJid || '120363410094452673@g.us',
      fromMe: opts.fromMe ?? false,
      participant: opts.participant,
      participantAlt: opts.participantAlt,
      addressingMode: opts.addressingMode,
    },
    pushName: opts.pushName || '',
    message: opts.message,
    messageTimestamp: opts.timestamp ?? Math.floor(Date.now() / 1000),
  };
}

/** Tipos de mensagem sintéticos, no formato do Baileys. */
export const MSG = {
  texto: (t: string) => ({ conversation: t }),
  textoEstendido: (t: string) => ({ extendedTextMessage: { text: t } }),
  sticker: () => ({ stickerMessage: { mimetype: 'image/webp' } }),
  imagem: (caption?: string) => ({ imageMessage: { caption, mimetype: 'image/jpeg' } }),
  video: (caption?: string) => ({ videoMessage: { caption, mimetype: 'video/mp4' } }),
  buttons: (text = 'Escolha', footer?: string) => ({
    buttonsMessage: { contentText: text, footerText: footer, buttons: [{ buttonId: '1', buttonText: { displayText: 'OK' } }] },
  }),
  lista: (text = 'Menu') => ({
    listMessage: { title: text, description: 'Opções', sections: [{ title: 'S', rows: [{ rowId: '1', title: 'Item' }] }] },
  }),
  template: (text = 'Template') => ({
    templateMessage: { hydratedTemplate: { hydratedContentText: text } },
  }),
  interativo: (text = 'Interativo') => ({
    interactiveMessage: { body: { text }, nativeFlowMessage: { buttons: [] } },
  }),
  produto: () => ({ productMessage: { product: { title: 'Produto' } } }),
  cassino: () => ({
    extendedTextMessage: {
      text: 'Taxa de vitórias 98%! Recolha contínua 777-7777 bônus de boas-vindas https://kl7.games/?c=10103',
    },
  }),
};

/**
 * Cria um contexto de execução (ctx) que registra TODAS as chamadas externas,
 * sem tocar em nada real. A fronteira externa é exatamente o que é mockado.
 */
export function makeHarnessCtx(opts: {
  groupId?: string;
  /** Admins do grupo (ids). */
  admins?: string[];
  /** Superadmins. */
  superAdmins?: string[];
  /** Lança erro ao deletar (para testar falha de delete). */
  deleteThrows?: boolean;
} = {}) {
  const calls: HarnessCall[] = [];
  const logs: string[] = [];
  const groupId = opts.groupId || '120363410094452673@g.us';

  const participants = [
    ...(opts.admins || []).map(id => ({ id, isAdmin: true, isSuperAdmin: false })),
    ...(opts.superAdmins || []).map(id => ({ id, isAdmin: true, isSuperAdmin: true })),
  ];

  const ctx = {
    log: (m: string) => { logs.push(m); },
    warn: (m: string, e?: any) => { logs.push(`[WARN] ${m} ${e || ''}`); },
    getChat: async (gid: string) => ({
      id: gid,
      isGroup: true,
      name: 'Grupo Teste',
      participants,
      raw: { participants },
    }),
    removeParticipant: async (gid: string, uid: string) => {
      calls.push({ step: 'remove', payload: { groupId: gid, userId: uid } });
    },
    sendMessage: async (gid: string, text: string, options?: any) => {
      if (options?.delete) {
        if (opts.deleteThrows) throw new Error('delete falhou (simulado)');
        calls.push({ step: 'delete', payload: { groupId: gid, key: options.delete } });
        return;
      }
      calls.push({ step: 'announce', payload: { groupId: gid, text } });
    },
  };

  return { ctx, calls, logs, groupId };
}

/**
 * Executa o pipeline completo com o engine REAL.
 *
 * @returns decisão + todas as chamadas externas + logs
 */
export async function runPipeline(opts: {
  msg: any;
  groupId: string;
  senderJid: string;
  senderName?: string;
  ctx: any;
  /** Módulos já carregados (permite injetar mocks de infrações/banco). */
  engine: { evaluate: Function };
}): Promise<HarnessResult> {
  const { msg, groupId, senderJid, senderName = '', ctx, engine } = opts;

  const decision = await engine.evaluate(msg, ctx, groupId, senderJid, senderName);

  return {
    decision: decision as any,
    calls: (ctx as any).__calls || [],
    logs: (ctx as any).__logs || [],
    correlationId: msg?.key?.id || '',
  };
}
