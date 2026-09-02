/**
 * autoModEngine.ts — Motor de moderação automática (engine Baileys / ativo).
 *
 * Regras (flags no group_mod, databaseService):
 *   antiestrangeiro  — ban+remove+delete TODO não-brasileiro (DDI != 55).
 *   remover          — anti-bot por padrões (foreign + conteúdo suspeito + nome suspeito + repetido).
 *   autolink         — delete mensagem + announce se link de domínio suspeito.
 *   antispam         — delete mensagem + announce se palavra-chave de spam + contexto (link/fingerprint/foreign).
 *   detectar         — announce toggle (anuncia no grupo todas as ações se on).
 *
 * Integração: BaileysAdapter.dispatchMessage → fire-and-forget (não bloqueia caminho crítico).
 *
 * ATENÇÃO: delete mensagem só funciona se bot é admin do grupo. Se não for, a deleção falha (log) —
 *          a remoção do participante (ban) ainda funciona se bot for admin.
 */
import { WAMessage } from '@whiskeysockets/baileys';
import {
  getGroupMod,
  banUser,
  recordMemberJoin,
  recordMessageFingerprint,
  getRecentFingerprintCount,
  cleanupOldFingerprintEntries,
  cleanupOldJoinEntries,
} from './databaseService.js';
import { recordInfraction } from './infractions.js';
import { isProtectedTarget } from '../services/permissions.js';

// ─── Configurações editáveis ────────────────────────────────────────────────
const SUSPICIOUS_DOMAINS = [
  'wtf', 'bet', 'game', 'win', 'xyz', 'top', 'click',
  'casino', 'bonus', 'aposta', 'vareja', 'sport', 'jackpot',
  'slots', 'poker', 'bing', 'lucky', 'vip', 'gratuito',
];

const SPAM_KEYWORDS = [
  'ganhe dinheiro', 'lucro fácil', 'recolha', 'bônus',
  'taxa de vitórias', 'jogue e ganhe', 'dinheiro fácil',
  'coloque agora', 'ptsu mae', 'ganhar', 'sorte', 'acumulado',
];

const SUSPICIOUS_DISPLAY_NAMES: RegExp[] = [
  /^\s*$/,                                       // nome vazio
  /^[\s\p{Emoji}\p{Other_Symbol}\p{Punctuation}]+$/u, // só emojis/símbolos
  /^(bot|🤖|botão|robô|assistant|auto|spammer|spam)$/i,
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function extractNumber(jid: string): string {
  return (jid || '').replace(/\D/g, '');
}

export function isForeignNumber(jid: string): boolean {
  const n = extractNumber(jid);
  return n.length > 0 && !n.startsWith('55');
}

/** Normaliza nome para checagem de bot-pattern. */
function normalizeDisplayName(name: string): string {
  return (name || '').toLowerCase().trim();
}

/** Se o display name é suspeito (vazio, só emojis/símbolos, nome típico de bot). */
export function isSuspiciousDisplayName(name: string): boolean {
  const n = normalizeDisplayName(name);
  if (!n) return true;
  if (SUSPICIOUS_DISPLAY_NAMES.some(r => r.test(n))) return true;
  // nomes que contêm apenas dígitos e/ou símbolos (sem letras)
  const letters = n.replace(/[^a-záàâãéèêíóôõöúç]/gi, '').length;
  if (letters === 0) return true;
  return false;
}

/** Extrai texto de mensagem interativa usando API pública do Baileys (proto.Message). */
export function extractTextFromWAMessage(msg: WAMessage): string {
  const m = msg.message as any;
  const parts: string[] = [];

  // Texto simples / extended text
  if (m.conversation) parts.push(String(m.conversation));
  if (m.extendedTextMessage) {
  const etm = m.extendedTextMessage;
    if (etm.text) parts.push(String(etm.text));
    if (etm.caption) parts.push(String(etm.caption));
    // link preview (campo com hífen precisa de index signature)
    try {
      const lp = etm['linkPreview'];
      if (lp && typeof lp === 'object') {
        const url = lp['canonical-url'] || lp['matchedText'] || '';
        if (url) parts.push(String(url));
        const title = lp.title || '';
        const desc = lp.description || '';
        if (title) parts.push(String(title));
        if (desc) parts.push(String(desc));
      }
    } catch { /* ignorar */ }
  }

  // Botões
  if (m.buttonsMessage) {
    const bm = m.buttonsMessage as any;
    if (bm.contentText) parts.push(String(bm.contentText));
    if (bm.footerText) parts.push(String(bm.footerText));
    if (bm.headerText) parts.push(String(bm.headerText));
    const buttons = bm.buttons || [];
    for (const b of buttons) {
      if (b.buttonText && typeof b.buttonText === 'object' && b.buttonText.displayText) {
        parts.push(String(b.buttonText.displayText));
      }
      if (b.buttonId) parts.push(String(b.buttonId));
      // botões interativos (quick_reply / cta_url / cta_copy / cta_call)
      try {
        const params = b.buttonParamsJson ? JSON.parse(String(b.buttonParamsJson)) : null;
        if (params) {
          if (params.display_text) parts.push(String(params.display_text));
          if (params.url && !parts.some(p => p === params.url)) parts.push(String(params.url));
          if (params.copy_code) parts.push(`copy:${params.copy_code}`);
        }
      } catch { /* ignorar */ }
    }
  }

  // Resposta de botão (quando usuário clica)
  if (m.buttonsResponseMessage) {
    const br = m.buttonsResponseMessage as any;
    if (br.buttonReply && br.buttonReply.displayText) {
      parts.push(String(br.buttonReply.displayText));
    }
  }

  // Listas / respostas de lista
  if (m.listMessage) {
    const lm = m.listMessage as any;
    if (lm.title) parts.push(String(lm.title));
    if (lm.description) parts.push(String(lm.description));
  }
  if (m.listResponseMessage) {
    const lr = m.listResponseMessage as any;
    if (lr.title) parts.push(String(lr.title));
    if (lr.description) parts.push(String(lr.description));
    if (lr.listSelectedId) parts.push(`list:${lr.listSelectedId}`);
  }

  // Templates (card/buttons) — Baileys pode expor como templateMessage
  if (m.templateMessage) {
    const tm = m.templateMessage as any;
    try {
      // hydrated fields podem estar em hydratedTemplate ou diretamente
      const hydrated = tm.hydratedTemplate || tm;
      if (hydrated.hydratedContentText) parts.push(String(hydrated.hydratedContentText));
      if (hydrated.hydratedTitleText) parts.push(String(hydrated.hydratedTitleText));
      if (hydrated.hydratedFooterText) parts.push(String(hydrated.hydratedFooterText));
    } catch { /* ignorar */ }
  }

  // Interactive message genérico (cards, quick replies etc.)
  if (m.interactiveMessage) {
    const im = m.interactiveMessage as any;
    if (im.body && typeof im.body === 'object' && im.body.text) parts.push(String(im.body.text));
    if (im.footer && typeof im.footer === 'object' && im.footer.text) parts.push(String(im.footer.text));
    if (im.header && typeof im.header === 'object' && im.header.title) parts.push(String(im.header.title));
  }

  // Resposta de interactive
  if (m.interactiveResponseMessage) {
    const irm = m.interactiveResponseMessage as any;
    if (irm.contextInfo && typeof irm.contextInfo === 'object' && irm.contextInfo.displayText) {
      parts.push(String(irm.contextInfo.displayText));
    }
  }

  // Mensagem forward
  if ((m as any).forward) {
    const fwd = (m as any).forward;
    try {
      if (fwd.from && typeof fwd.from === 'object' && fwd.from.pushName) {
        parts.push(`[forward:${fwd.from.pushName}]`);
      }
    } catch { /* ignorar */ }
  }

  // Contato enviado
  if ((m as any).contacts) {
    const cts = (m as any).contacts;
    if (cts.displayName) parts.push(`[contato:${cts.displayName}]`);
  }

  // Poll
  if ((m as any).poll) parts.push(`[poll:${(m as any).poll?.question || ''}]`);

  // grupo convite
  if (m.groupInviteMessage) {
    const gim = m.groupInviteMessage as any;
    if (gim.text) parts.push(String(gim.text));
    if (gim.subject) parts.push(String(gim.subject));
  }

  // Pin / evento / etc. — ignorar (não geram conteúdo textual relevante para moderação)

  return parts.join(' ').trim();
}

/** Extrai URLs do texto. */
export function extractUrls(text: string): string[] {
  const urls: string[] = [];
  const re = /https?:\/\/[^\s<>"']+|www\.[^\s<>"']+/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    let u = m[0];
    if (u.startsWith('www.')) u = 'http://' + u;
    if (!urls.includes(u)) urls.push(u);
  }
  return urls;
}

/** Extrai domínios das URLs para checagem. */
export function extractDomains(urls: string[]): string[] {
  const domains: string[] = [];
  for (const u of urls) {
    try {
      const p = new URL(u);
      const hostname = p.hostname || '';
      const dparts = hostname.split('.');
      // domínio de 2º nível: penúltima parte antes do TLD
      const domain = dparts.length >= 2 ? dparts[dparts.length - 2] : hostname;
      if (domain && !domains.includes(domain.toLowerCase())) {
        domains.push(domain.toLowerCase());
      }
    } catch { /* ignorar URL inválida */ }
  }
  return domains;
}

/** Se algum domínio é suspeito. */
export function isSuspiciousDomain(domains: string[]): boolean {
  for (const d of domains) {
    for (const s of SUSPICIOUS_DOMAINS) {
      if (d.includes(s)) return true;
    }
  }
  return false;
}

/** Se o texto contém alguma palavra-chave de spam. */
export function containsSpamKeyword(text: string): boolean {
  const low = text.toLowerCase();
  return SPAM_KEYWORDS.some(kw => low.includes(kw));
}

/** Gera fingerprint do texto (para anti-spam: detecta mensagem repetida). */
export function fingerprint(text: string): string {
  // Normaliza: minúsculas, sem duplicatas de espaço, sem URLs, sem emojis pesados
  let t = text.toLowerCase().trim();
  t = t.replace(/\s+/g, ' ');
  t = t.replace(/https?:\/\/[^\s]+/g, '[URL]');
  t = t.replace(/[^\p{L}\p{N}\p{Z}\p{P}]/gu, ''); // remove emojis e outros caracteres não-ASCII
  // Tamanho máximo para fingerprint (evita fingerprints muito específicos que nunca se repetem)
  if (t.length > 120) t = t.slice(0, 120);
  return t;
}

// ─── Contexto de integração com o adapter ─────────────────────────────────

interface AutoModContext {
  sock: any;
  userId: string;
  groupName: string;
  getChat: (jid: string) => Promise<{ participants: any[]; id: string; subject?: string } | null>;
  sendMessage: (jid: string, text: string, opts?: any) => Promise<any>;
  removeParticipant: (groupId: string, userId: string) => Promise<void>;
  log: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  error: (...args: any[]) => void;
}

// ─── Engine ────────────────────────────────────────────────────────────────

export interface AutoModResult {
  acted: boolean;
  reason: string;
  action: string;
}

export async function evaluate(
  msg: WAMessage,
  ctx: AutoModContext,
  groupId: string,
  senderJid: string,
  senderName: string,
): Promise<AutoModResult> {
  // 1. Extração de conteúdo
  const text = extractTextFromWAMessage(msg);
  const urls = extractUrls(text);
  const domains = extractDomains(urls);
  const fp = fingerprint(text);

  // 2. Config do grupo
  let config;
  try {
    config = await getGroupMod(groupId);
  } catch (err: any) {
    ctx.warn('[AutoMod] erro ao carregar config do grupo:', err?.message);
    return { acted:false, reason:'erro ao carregar config', action:'none' };
  }

  // Nada ligado → return
  const anyOn = config.antiestrangeiro || config.remover || config.autolink || config.antispam;
  if (!anyOn) {
    ctx.log(`[AutoMod] grupo ${groupId}: nada ligado — ignorando`);
    return { acted:false, reason:'nada ligado', action:'none' };
  }

  // 3. Auditoria: registrar entrada do membro (se ainda não registrado)
  try {
    await recordMemberJoin(groupId, senderJid);
  } catch (err: any) {
    ctx.warn('[AutoMod] erro ao registrar entrada do membro:', err?.message);
  }

  // 4. Limpeza periódica de fingerprints antigos (lazy)
  if (fp) {
    try {
      await cleanupOldFingerprintEntries(3600); // 1h
    } catch { /* ignorar */ }
  }

  // 5. Flag de spam: palavra-chave presente?
  const hasSpamKeyword = containsSpamKeyword(text);
  // 6. Contexto de spam: link suspeito / fingerprint repetido / foreign
  let spamContext = false;
  if (isForeignNumber(senderJid)) spamContext = true;
  if (isSuspiciousDomain(domains)) spamContext = true;
  if (fp) {
    try {
      const cnt = await getRecentFingerprintCount(groupId, fp, senderJid, 60);
      if (cnt >= 2) spamContext = true;
    } catch { /* ignorar */ }
  }
  // Registrar fingerprint (para detecção de repetidas futuras)
  if (fp) {
    try {
      await recordMessageFingerprint(groupId, fp, senderJid);
    } catch { /* ignorar */ }
  }

  // 7. Exibir nome do remetente (para anti-bot)
  const suspiciousName = isSuspiciousDisplayName(senderName);

  // ─── ORQUESTRAÇÃO DE REGRAS ──────────────────────────────────────────────
  const reportedActions: string[] = [];
  const msgType = msg.message ?? {};

  // REGRA 1: antiestrangeiro (absoluto) — ban+remove+delete de TODO não-brasileiro
    if (config.antiestrangeiro && isForeignNumber(senderJid)) {
      const reasonText = `${senderName || senderJid} — DDI estrangeiro (anti-estrangeiro).`;
      reportedActions.push(`ANTIESTRANGEIRO: ${reasonText}`);
      ctx.log(`[AutoMod] antiestrangeiro ativado: ${reasonText}`);

      // Blindagem: ID protegido não é banido/removido/deletado
      if (isProtectedTarget(senderJid)) {
        ctx.log(`[AutoMod] antiestrangeiro ignorado — ID protegido: ${senderJid}`);
        return { acted: false, reason: 'antiestrangeiro: ID protegido', action: 'none' };
      }

      // Ban persistente
      if (config.remover) {
        try {
          await banUser({ groupId, userId: senderJid, reason: 'banido-autoestrangeiro' });
          ctx.log(`[AutoMod] ban persistente registrado para ${senderJid}`);
        } catch (err: any) { ctx.warn('[AutoMod] erro ao banir:', err?.message); }

        // Remove do grupo
        try {
          await ctx.removeParticipant(groupId, senderJid);
          ctx.log(`[AutoMod] removido do grupo: ${senderJid}`);
          reportedActions.push(`REMOVIDO`);
        } catch (err: any) {
          ctx.warn(`[AutoMod] erro ao remover ${senderJid}:`, err?.message);
          reportedActions.push(`FALHA AO REMOVER (${err?.message || 'erro'})`);
        }
      }

      // Delete mensagem (se bot for admin) — antiestrangeiro sempre deleta
            try { 
                await ctx.sendMessage(groupId, '', { delete: { id: msg.key.id, fromMe: false, participant: senderJid } });
                ctx.log(`[AutoMod] mensagem deletada de ${senderJid}`);
                reportedActions.push(`MSGMENSAGEMAPAGADA`);
              } catch (err: any) {
                ctx.warn(`[AutoMod] erro ao deletar mensagem:`, err?.message);
            }
      
            // Registrar infração
            await recordInfraction(groupId, senderJid).catch(err => ctx.warn('[AutoMod] erro ao registrar infração:', err?.message));

            // Anunciar se detectar on
            if (config.detectar === true) {
              const ann = reportedActions.join(' | ');
              try {
                await ctx.sendMessage(groupId, `🚫 [AUTOMOD] ${ann}: ${senderName || senderJid} (${senderJid})`);
              } catch (err: any) { ctx.warn('[AutoMod] erro ao anunciar:', err?.message); }
            }

            return {
              acted:true,
              reason:`antiestrangeiro: ${reportedActions.join('; ')}`,
              action:'ban+remove+delete+announce',
            };
          }

  // REGRA 2: anti-bot (remover) — foreign + conteúdo suspeito + nome suspeito + repetido
  // Threshold: >=2 sinais → ban+remove+delete+announce
  const botSignals: string[] = [];
  if (isForeignNumber(senderJid)) botSignals.push('foreign');
  if (isSuspiciousDomain(domains)) botSignals.push('link-suspeito');
  if (msgType.buttonsMessage || msgType.listMessage || msgType.templateMessage || msgType.interactiveMessage) botSignals.push('mensagem-interativa');
  if (suspiciousName) botSignals.push('nome-suspeito');
  if (hasSpamKeyword && spamContext) botSignals.push('spam-com-contexto');

  if (config.remover && botSignals.length >= 2) {
      const reasonText = `${senderName || senderJid} — bot detectado (${botSignals.join(', ')}).`;
      reportedActions.push(`ANTIBOT: ${reasonText}`);
      ctx.log(`[AutoMod] antibot ativado: ${reasonText}`);

      // Blindagem: ID protegido não é banido/removido/deletado
      if (isProtectedTarget(senderJid)) {
        ctx.log(`[AutoMod] antibot ignorado — ID protegido: ${senderJid}`);
        return { acted: false, reason: 'antibot: ID protegido', action: 'none' };
      }

      // Ban persistente
      try {
        await banUser({ groupId, userId: senderJid, reason: 'banido-antibot' });
        ctx.log(`[AutoMod] ban persistente registrado para ${senderJid}`);
      } catch (err: any) { ctx.warn('[AutoMod] erro ao banir:', err?.message); }

      // Remove do grupo
      try {
        await ctx.removeParticipant(groupId, senderJid);
        ctx.log(`[AutoMod] removido do grupo: ${senderJid}`);
        reportedActions.push(`REMOVIDO`);
      } catch (err: any) {
        ctx.warn(`[AutoMod] erro ao remover ${senderJid}:`, err?.message);
        reportedActions.push(`FALHA AO REMOVER (${err?.message || 'erro'})`);
      }

      // Delete mensagem
            try {
              await ctx.sendMessage(groupId, '', { delete: { id: msg.key.id, fromMe: false, participant: senderJid } });
              ctx.log(`[AutoMod] mensagem deletada de ${senderJid}`);
              reportedActions.push(`MSGUPDELETE`);
            } catch (err: any) { ctx.warn('[AutoMod] erro ao deletar:', err?.message); }

            // Registrar infração
            await recordInfraction(groupId, senderJid).catch(err => ctx.warn('[AutoMod] erro ao registrar infração:', err?.message));

            // Anunciar se detectar on
            if (config.detectar === true) {
              const ann = reportedActions.join(' | ');
              try {
                await ctx.sendMessage(groupId, `🤖 [AUTOMOD] ${ann}: ${senderName || senderJid} (${senderJid})`);
              } catch (err: any) { ctx.warn('[AutoMod] erro ao anunciar:', err?.message); }
            }

            return {
              acted: true,
              reason: `antibot: ${botSignals.join(', ')} → ${reportedActions.join('; ')}`,
              action: 'ban+remove+delete+announce',
            };
          }

  // REGRA 3: anti-link (autolink) — delete mensagem + announce (sem ban)
    if (config.autolink && isSuspiciousDomain(domains)) {
      // Blindagem: ID protegido não tem mensagem deletada
      if (isProtectedTarget(senderJid)) {
        ctx.log(`[AutoMod] antilink ignorado — ID protegido: ${senderJid}`);
        return { acted: false, reason: 'antilink: ID protegido', action: 'none' };
      }

      const urlList = [...new Set(domains.filter(d => SUSPICIOUS_DOMAINS.some(s => d.includes(s))))].join(', ');
      reportedActions.push(`ANTILINK: domínio(s) suspeito(s) ${urlList} em ${senderJid}`);
      ctx.log(`[AutoMod] antilink ativado: domínios ${urlList} de ${senderJid}`);

      // Delete mensagem
      try {
        await ctx.sendMessage(groupId, '', { delete: { id: msg.key.id, fromMe: false, participant: senderJid } });
        ctx.log(`[AutoMod] mensagem deletada por antilink: ${senderJid}`);
        reportedActions.push(`MSGUPDELETE`);
      } catch (err: any) { ctx.warn('[AutoMod] erro ao deletar mensagem:', err?.message); }

      // Anunciar se detectar on
      if (config.detectar === true) {
        try {
          await ctx.sendMessage(
            groupId,
            `🔗 [AUTOMOD] Mensagem removida (link suspeito): ${senderName || senderJid} (${senderJid}) — domínios: ${urlList}`
          );
        } catch (err: any) { ctx.warn('[AutoMod] erro ao anunciar:', err?.message); }
      }

      return {
        acted:true,
        reason:`antilink: domínios ${urlList}`,
        action:'delete+announce',
      };
    }

  // REGRA 4: anti-spam (antispam) — palavra-chave + contexto → delete mensagem + announce
    // Palavra-chave ISOLADA (sem contexto) NÃO dispara ação, conforme solicitação.
    if (config.antispam && hasSpamKeyword && spamContext) {
      // Blindagem: ID protegido não tem mensagem deletada
      if (isProtectedTarget(senderJid)) {
        ctx.log(`[AutoMod] antispam ignorado — ID protegido: ${senderJid}`);
        return { acted: false, reason: 'antispam: ID protegido', action: 'none' };
      }

      const snippet = text.slice(0, 40);
      reportedActions.push(`ANTISPAM: palavra-chave "${snippet}${text.length > 40 ? '...' : ''}" em ${senderJid}`);
      ctx.log(`[AutoMod] antispam ativado: anti-spam keyword + contexto → delete+announce`);

      // Delete mensagem
      try {
        await ctx.sendMessage(groupId, '', { delete: { id: msg.key.id, fromMe: false, participant: senderJid } });
        ctx.log(`[AutoMod] mensagem deletada por antispam: ${senderJid}`);
        reportedActions.push(`MSGUPDELETE`);
      } catch (err: any) { ctx.warn('[AutoMod] erro ao deletar mensagem:', err?.message); }

      // Anunciar se detectar on
            if (config.detectar === true) {
              const ann = reportedActions.join(' | ');
              try {
                await ctx.sendMessage(
                  groupId,
                  `📢 [AUTOMOD] Mensagem removida (spam detectado): ${senderName || senderJid} (${senderJid})`
                );
              } catch (err: any) { ctx.warn('[AutoMod] erro ao anunciar:', err?.message); }
            }

            // Registrar infração
            await recordInfraction(groupId, senderJid).catch(err => ctx.warn('[AutoMod] erro ao registrar infração:', err?.message));

            return {
              acted:true,
              reason:`antispam: ${reportedActions.join('; ')}`,
              action:'delete+announce',
            };
          }

  // Nada ativado que precise agir
  ctx.log(`[AutoMod] sem ações: config=${JSON.stringify(config)} foreign=${isForeignNumber(senderJid)} spamKW=${hasSpamKeyword} spamCtx=${spamContext} domain=${isSuspiciousDomain(domains)} botSig=${botSignals.length}`);
  return { acted:false, reason:'sem ações', action:'none' };
}

// ─── Cleanup periódico (chamar a cada N min via setInterval no entry point) ──
export async function runPeriodicCleanup(): Promise<void> {
  try {
    await cleanupOldFingerprintEntries(3600); // 1h
    await cleanupOldJoinEntries(2592000);   // 30d
  } catch (err: any) {
    console.warn('[autoModEngine] runPeriodicCleanup falhou:', err?.message);
  }
}
