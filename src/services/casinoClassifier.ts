/**
 * casinoClassifier.ts — Classificador de spam de cassino/betano
 *
 * Detecta mensagens de bots de cassino com múltiplos sinais para evitar
 * falsos positivos. Nenhum sinal isolado é suficiente para classificar.
 *
 * Sinais observados em mensagens reais:
 * - buttonsMessage (promoções com botões de CTA)
 * - templateMessage / interactiveMessage (cards promocionais)
 * - Links para domínios suspeitos (kl7, ck7, bet, etc.)
 * - Palavras-chave de cassino (bônus, 777, ganhe, etc.)
 * - Números estrangeiros (DDI != 55)
 * - Nomes de exibição suspeitos (vazio, emoji, "bot")
 * - Múltiplos sinais simultâneos = alta confiança
 */

export interface CasinoDetection {
  detected: boolean;
  confidence: number; // 0-100
  signals: string[];
  reason: string;
}

// ─── Configuração ─────────────────────────────────────────────────────────

const CASINO_DOMAINS = [
  'kl7', 'ck7', 'ck7bet', 'betano', 'betfair', 'bet365', 'sportingbet',
  'mariobet', 'blaze', 'estrelabet', 'novibet', 'sportingbet', 'fusbet',
  'brabet', 'onomabet', 'betesporte', 'br4bet', 'sortenabet', 'pgbet',
  'labet', 'reidobet', 'ojogos', 'betboo', '1xbet', 'pinnacle',
  'rivalo', 'cloudbet', 'fortunejack', 'bitcasino', 'stake',
];

const CASINO_PATTERNS = [
  /777/i, /bônus/i, /bonus/i, /ganhe/i, /ganhar/i, /aposta/i,
  /apostas/i, /cassino/i, /casino/i, /roleta/i, /blackjack/i,
  /poker/i, /slot/i, /slots/i, /jogar/i, /jogue/i, /jogo/i,
  /jogos/i, /grátis/i, /gratis/i, /rodadas/i, /giros/i, /spins/i,
  /vítória/i, /vitoria/i, /win/i, /winner/i, /jackpot/i, /premio/i,
  /prêmio/i, /recompensa/i, /recolha/i, /cadastro/i, /deposite/i,
  /depósito/i, /saque/i, /sacar/i, /pagamento/i, /pagar/i,
  /dinheiro/i, /lucro/i, /lucrar/i, /renda/i, /rendimento/i,
];

// ─── Funções de detecção ──────────────────────────────────────────────────

export function hasButtonsMessage(msg: any): boolean {
  return !!(msg?.buttonsMessage || msg?.buttonsResponseMessage);
}

export function hasTemplateMessage(msg: any): boolean {
  return !!(msg?.templateMessage || msg?.listMessage || msg?.listResponseMessage || msg?.interactiveMessage);
}

export function hasSuspiciousDomain(text: string): boolean {
  const low = text.toLowerCase();
  return CASINO_DOMAINS.some(d => low.includes(d));
}

export function hasCasinoKeywords(text: string): boolean {
  const low = text.toLowerCase();
  return CASINO_PATTERNS.some(p => p.test(low));
}

export function hasExternalLinks(text: string): boolean {
  const urls: string[] = [];
  const re = /https?:\/\/[^\s<>\"']+/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    urls.push(m[0].toLowerCase());
  }
  // links que NÃO são de domínios conhecidos (whatsapp, youtube, etc.)
  const knownDomains = ['youtube.com', 'youtu.be', 'google.com', 'wikipedia.org', 'github.com', 'wa.me', 'whatsapp.com'];
  return urls.some(u => !knownDomains.some(k => u.includes(k)));
}

export function isForeignNumber(jid: string): boolean {
  const n = (jid || '').replace(/\D/g, '');
  return n.length > 0 && !n.startsWith('55');
}

export function hasSuspiciousDisplayName(name: string): boolean {
  const n = (name || '').toLowerCase().trim();
  if (!n) return true;
  if (/^[\s\p{Emoji}\p{Other_Symbol}\p{Punctuation}]+$/u.test(n)) return true;
  if (/^(bot|🤖|botão|robô|assistant|auto|spammer|spam)$/i.test(n)) return true;
  const letters = n.replace(/[^a-záàâãéèêíóôõöúç]/gi, '').length;
  if (letters === 0) return true;
  return false;
}

/**
 * Extrai texto de qualquer formato de mensagem para análise
 */
export function extractAllText(msg: any): string {
  if (!msg) return '';
  const m = msg.message || msg;
  const parts: string[] = [];

  if (m.conversation) parts.push(String(m.conversation));
  if (m.extendedTextMessage?.text) parts.push(String(m.extendedTextMessage.text));
  if (m.imageMessage?.caption) parts.push(String(m.imageMessage.caption));
  if (m.videoMessage?.caption) parts.push(String(m.videoMessage.caption));
  if (m.documentMessage?.caption) parts.push(String(m.documentMessage.caption));

  if (m.buttonsMessage) {
    const bm = m.buttonsMessage;
    if (bm.contentText) parts.push(String(bm.contentText));
    if (bm.footerText) parts.push(String(bm.footerText));
    if (bm.headerText) parts.push(String(bm.headerText));
    for (const b of (bm.buttons || [])) {
      if (b.buttonText?.displayText) parts.push(String(b.buttonText.displayText));
      if (b.buttonId) parts.push(String(b.buttonId));
      try {
        const params = b.buttonParamsJson ? JSON.parse(String(b.buttonParamsJson)) : null;
        if (params) {
          if (params.display_text) parts.push(String(params.display_text));
          if (params.url) parts.push(String(params.url));
          if (params.copy_code) parts.push(String(params.copy_code));
        }
      } catch { /* ignore */ }
    }
  }

  if (m.templateMessage) {
    const tm = m.templateMessage;
    const hydrated = tm.hydratedTemplate || tm;
    if (hydrated.hydratedContentText) parts.push(String(hydrated.hydratedContentText));
    if (hydrated.hydratedTitleText) parts.push(String(hydrated.hydratedTitleText));
    if (hydrated.hydratedFooterText) parts.push(String(hydrated.hydratedFooterText));
  }

  if (m.interactiveMessage) {
    const im = m.interactiveMessage;
    if (im.body?.text) parts.push(String(im.body.text));
    if (im.footer?.text) parts.push(String(im.footer.text));
    if (im.header?.title) parts.push(String(im.header.title));
    for (const b of (im.nativeFlowMessage?.buttons || [])) {
      if (typeof b.buttonParamsJson === 'string') {
        try {
          const parsed = JSON.parse(b.buttonParamsJson);
          if (parsed.display_text) parts.push(String(parsed.display_text));
          if (parsed.url) parts.push(String(parsed.url));
        } catch { /* ignore */ }
      }
    }
  }

  if (m.listMessage) {
    const lm = m.listMessage;
    if (lm.title) parts.push(String(lm.title));
    if (lm.description) parts.push(String(lm.description));
  }

  return parts.join(' ').trim();
}

// ─── Classificador principal ──────────────────────────────────────────────

export function classifyCasino(
  msg: any,
  senderJid: string,
  senderName: string,
): CasinoDetection {
  const text = extractAllText(msg);
  const signals: string[] = [];

  // Sinal 1: Mensagem interativa (botões/template)
  if (hasButtonsMessage(msg.message || msg)) {
    signals.push('buttons-message');
  }
  if (hasTemplateMessage(msg.message || msg)) {
    signals.push('template-message');
  }

  // Sinal 2: Domínios de cassino
  if (hasSuspiciousDomain(text)) {
    signals.push('casino-domain');
  }

  // Sinal 3: Palavras-chave de cassino
  if (hasCasinoKeywords(text)) {
    signals.push('casino-keywords');
  }

  // Sinal 4: Links externos suspeitos
  if (hasExternalLinks(text)) {
    signals.push('external-links');
  }

  // Sinal 5: Número estrangeiro
  if (isForeignNumber(senderJid)) {
    signals.push('foreign-number');
  }

  // Sinal 6: Nome de exibição suspeito
  if (hasSuspiciousDisplayName(senderName)) {
    signals.push('suspicious-name');
  }

  // ─── Cálculo de confiança ──────────────────────────────────────────────
  let confidence = 0;

  // Combinações de alta confiança (≥ 3 sinais ou combinação específica)
  if (signals.includes('casino-domain')) confidence += 30;
  if (signals.includes('casino-keywords')) confidence += 20;
  if (signals.includes('buttons-message') || signals.includes('template-message')) confidence += 20;
  if (signals.includes('foreign-number')) confidence += 15;
  if (signals.includes('external-links')) confidence += 10;
  if (signals.includes('suspicious-name')) confidence += 5;

  // Bônus por múltiplos sinais
  if (signals.length >= 4) confidence += 15;
  else if (signals.length >= 3) confidence += 10;
  else if (signals.length >= 2) confidence += 5;

  // Limita a 100
  confidence = Math.min(confidence, 100);

  // ─── Decisão ───────────────────────────────────────────────────────────
  // Requer pelo menos 2 sinais E confiança >= 40
  const detected = signals.length >= 2 && confidence >= 40;

  return {
    detected,
    confidence,
    signals,
    reason: detected
      ? `Cassino detectado (${signals.length} sinais, ${confidence}% confiança): ${signals.join(', ')}`
      : `Não classificado como cassino (${signals.length} sinais, ${confidence}% confiança)`,
  };
}
