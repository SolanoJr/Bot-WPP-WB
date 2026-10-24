/**
 * presentationPublisher — publica apresentações no Telegram.
 *
 * O Telegram é ESPELHO. O SQLite é a fonte oficial. Se o Telegram cair, a
 * apresentação fica com status 'failed' e é retentada depois — nunca se perde.
 *
 * Destino configurável por env, com o padrão histórico como fallback:
 *   TELEGRAM_PRESENTATION_CHAT_ID   (default -1003470059875, Fortaleza 085)
 *   TELEGRAM_PRESENTATION_THREAD_ID (default 2, tópico Apresentações)
 *
 * Se a apresentação já tem `tg_message_id`, a atualização EDITA a mensagem
 * existente — não cria duplicata. Com foto, a legenda é editada
 * (editMessageCaption); sem foto, o texto (editMessageText).
 */
import { getDb } from './databaseService';
import { markPublished, markFailed, listPending, type PresentationRecord } from './presentationService';
import logger from './loggerService';

// Chat: `||` — env vazio (o pm2 faz merge e deixa a var vazia) deve cair no
// fallback; `Number('')` seria NaN e mataria a publicação. Thread: `??` —
// vazio é LEGÍTIMO (privado sem tópicos) e omite message_thread_id.
export const TG_CHAT_ID = process.env.TELEGRAM_PRESENTATION_CHAT_ID || '-1003470059875';
export const TG_THREAD_ID = process.env.TELEGRAM_PRESENTATION_THREAD_ID ?? '2';

/** Link público do tópico (para o aviso ao novato). */
export const TG_TOPIC_URL = 'https://t.me/Fortaleza_085/2';

/** Formata a apresentação para o Telegram. */
export function formatPresentation(rec: PresentationRecord, groupName?: string, groupLink?: string): string {
  const lines: string[] = [];

  // Cabeçalho: grupo de origem + link
  if (groupName) {
    lines.push(`📌 *Grupo:* ${groupName}`);
    if (groupLink) lines.push(`🔗 [Link do grupo](${groupLink})`);
    lines.push('');
  }

  // Nome + número (obrigatórios)
  if (rec.nome) lines.push(`👤 *${rec.nome}*`);
  if (rec.phone_number) lines.push(`📱 +${rec.phone_number}`);

  // Campos opcionais — só aparecem se existirem
  if (rec.idade) lines.push(`🎂 ${rec.idade} anos`);
  if (rec.trabalho) lines.push(`💼 ${rec.trabalho}`);
  if (rec.genero) lines.push(`⚧ ${rec.genero}`);
  if (rec.estado_civil) lines.push(`💍 ${rec.estado_civil}`);
  if (rec.bairro) lines.push(`📍 ${rec.bairro}`);
  if (rec.rede_social) lines.push(`🔗 ${rec.rede_social}`);
  if (rec.hobbies) lines.push(`🎮 ${rec.hobbies}`);
  if (rec.bio) lines.push(`📝 ${rec.bio}`);

  return lines.join('\n');
}

/**
 * Publica (ou edita) a apresentação no Telegram.
 *
 * @param photo opcional: `{ url }` faz o Telegram buscar a imagem; `{ buffer }`
 *        envia os bytes. Com foto, vai como sendPhoto com o texto de legenda
 *        (limite do Telegram: 1024 — acima disso a legenda trunca e o texto
 *        completo via como mensagem em seguida).
 * @returns o messageId da mensagem publicada/editada, ou null se falhou.
 */
export async function publishToTelegram(
  rec: PresentationRecord,
  bot: any,
  groupName?: string,
  groupLink?: string,
  photo?: { url?: string; buffer?: Buffer },
): Promise<string | null> {
  const text = formatPresentation(rec, groupName, groupLink);

  // Tópico opcional: env vazio significa chat sem tópicos (privado) — mandar 0
  // faz o Telegram rejeitar; omitir a chave é o caminho.
  const threadId = Number(TG_THREAD_ID) || undefined;

  try {
    // Se já existe mensagem no Telegram → EDITAR (não duplica)
    if (rec.tg_message_id) {
      try {
        if (photo) {
          // Mensagem de foto edita a legenda, não o texto.
          await bot.telegram.editMessageCaption(
            Number(TG_CHAT_ID),
            Number(rec.tg_message_id),
            undefined,
            text.slice(0, 1024),
            { parse_mode: 'Markdown', message_thread_id: threadId } as any
          );
        } else {
          await bot.telegram.editMessageText(
            Number(TG_CHAT_ID),
            Number(rec.tg_message_id),
            undefined,
            text,
            { parse_mode: 'Markdown', disable_web_page_preview: true, message_thread_id: threadId } as any
          );
        }
        logger.info('[presentationPublisher] mensagem editada', {
          presentationId: rec.presentation_id, tgMessageId: rec.tg_message_id,
        });
        return rec.tg_message_id;
      } catch (e: any) {
        // INC-021: a mensagem antiga pode ser de TIPO diferente do payload
        // novo (texto→foto: editMessageCaption falha com "no caption";
        // foto→texto: editMessageText falha com "no text"; msg apagada:
        // "message to edit not found"). O Telegram não converte tipo via edit
        // — apaga a antiga e publica no novo formato, mantendo o contrato de
        // correção: 1 mensagem por apresentação, substituir não duplicar.
        const recoverable = /no caption|no text|message to edit/i.test(e?.message || '');
        if (!recoverable) throw e;
        try {
          await bot.telegram.deleteMessage(Number(TG_CHAT_ID), Number(rec.tg_message_id));
        } catch { /* já não existia — segue para a nova publicação */ }
        logger.info('[presentationPublisher] tipo divergente — republicando como nova mensagem', {
          presentationId: rec.presentation_id, oldTgMessageId: rec.tg_message_id, hadPhoto: !!photo,
        });
        // cai no fluxo de primeira publicação: sendPhoto/sendMessage novo
        // gera novo message_id e markPublished atualiza o registro.
      }
    }

    // Primeira publicação
    let sent: any;
    if (photo) {
      const source = photo.url ?? photo.buffer!;
      const caption = text.length > 1024 ? `${text.slice(0, 1000)}…` : text;
      sent = await bot.telegram.sendPhoto(Number(TG_CHAT_ID), source, {
        caption,
        parse_mode: 'Markdown',
        message_thread_id: threadId,
      } as any);
      // Texto maior que a legenda comporta: a íntegra vai na mensagem seguinte.
      if (text.length > 1024) {
        const extra = await bot.telegram.sendMessage(Number(TG_CHAT_ID), text, {
          parse_mode: 'Markdown',
          disable_web_page_preview: true,
          message_thread_id: threadId,
        } as any);
        sent = extra ?? sent;
      }
    } else {
      sent = await bot.telegram.sendMessage(Number(TG_CHAT_ID), text, {
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
        message_thread_id: threadId,
      } as any);
    }

    const tgMessageId = String(sent?.message_id ?? '');
    if (!tgMessageId) throw new Error('Telegram não retornou message_id');

    await markPublished(rec.presentation_id, TG_CHAT_ID, TG_THREAD_ID, tgMessageId);
    logger.info('[presentationPublisher] publicada', {
      presentationId: rec.presentation_id, tgMessageId,
    });
    return tgMessageId;
  } catch (e: any) {
    // Telegram indisponível → marca como falha, NÃO perde a apresentação
    await markFailed(rec.presentation_id);
    // erro INLINE na string — o console do logger não imprime o meta-objeto
    logger.warn(`[presentationPublisher] falha ao publicar ${rec.presentation_id}: ${e?.message}`);
    return null;
  }
}

/**
 * INC-021 — picsum determinístico da apresentação. Gerado UMA vez no
 * multiPlatform (antes das duas chamadas) para os DOIS canais verem a mesma
 * foto: antes o grupo gerava o placeholder internamente e o Telegram
 * publicava texto puro (msg 217: grupo com foto+caption, privado só texto).
 */
export function picsumFor(rec: PresentationRecord): string {
  const seed = (rec.phone_number || rec.user_id || 'apresentacao').replace(/\D/g, '') || 'apresentacao';
  return `https://picsum.photos/seed/${seed}/512/512`;
}

/**
 * Responde NO GRUPO WhatsApp à apresentação consolidada: uma mensagem única
 * com foto + caption (template formatado), quoted na última mensagem
 * coletada do apresentador. É o canal que o usuário VÊ — o Telegram é espelho.
 *
 * Foto: a do próprio apresentador quando existe (buffer baixado / url).
 * O placeholder picsum vem do multiPlatform (picsumFor) — o fallback interno
 * foi removido para que os dois canais recebam SEMPRE a mesma imagem.
 * Foto é enriquecimento: se o envio com imagem falhar, cai para texto puro
 * com quote. Qualquer falha retorna false e NÃO bloqueia o espelho Telegram.
 */
export async function replyPresentationToGroup(
  rec: PresentationRecord,
  sock: any,
  photo?: { url?: string; buffer?: Buffer },
): Promise<boolean> {
  try {
    if (!sock?.sendMessage) return false;
    const text = formatPresentation(rec);
    const caption = `${text}\n\n📎 Registro completo: ${TG_TOPIC_URL}`;

    // Quote da mensagem original (a última coletada). Em produção o loadMessage
    // devolve o raw do wire; para mensagens injetadas em LAB (fora do store do
    // Baileys) monta um stub {key,message} simétrico ao quoted payload que o
    // messageSender constrói nos replies (provado no E2E do $noticias lab).
    let quoted: any;
    try {
      const ids = JSON.parse(rec.source_message_ids || '[]');
      const lastId = Array.isArray(ids) ? ids[ids.length - 1] : undefined;
      if (lastId) {
        const rawId = String(lastId).split(':').pop();
        quoted = await sock.loadMessage?.(rec.group_id, rawId);
        if (!quoted) {
          quoted = {
            key: { remoteJid: rec.group_id, id: rawId, fromMe: false, participant: rec.user_id },
            message: { conversation: rec.original_text || '' },
          };
        }
      }
    } catch { /* sem quote, envia sem citação */ }

    // Foto: buffer (imagem enviada no grupo) > url. O picsum placeholder
    // agora vem SEMPRE do caller (multiPlatform via picsumFor) — os dois
    // canais recebem a mesma imagem.
    const image: { url: string } | Buffer | undefined =
      photo?.buffer || (photo?.url ? { url: photo.url } : undefined);

    // Degraus de envio: [foto+quote] → foto → [texto+quote] → texto.
    // Foto é enriquecimento, quote também — a resposta no grupo é o gate.
    // Sem image (foto é opcional desde o INC-021), os degraus de foto somem.
    const attempts: Array<() => Promise<any>> = [];
    if (image && quoted) attempts.push(() => sock.sendMessage(rec.group_id, { image: image as any, caption }, { quoted }));
    if (image) attempts.push(() => sock.sendMessage(rec.group_id, { image: image as any, caption }, {}));
    if (quoted) attempts.push(() => sock.sendMessage(rec.group_id, { text: caption }, { quoted }));
    attempts.push(() => sock.sendMessage(rec.group_id, { text: caption }, {}));

    const why: string[] = [];
    const photoSteps = image ? (quoted ? 2 : 1) : 0;
    for (let i = 0; i < attempts.length; i++) {
      try {
        await attempts[i]();
        const isPhoto = i < photoSteps;
        logger.info('[presentationPublisher] resposta no grupo enviada', {
          presentationId: rec.presentation_id, groupId: rec.group_id,
          hasPhoto: isPhoto, quoted: !!quoted && i % 2 === 0,
        });
        return true;
      } catch (e: any) {
        // erro INLINE na string — o console do logger não imprime o meta-objeto
        why.push(e?.message);
      }
    }
    logger.warn(`[presentationPublisher] resposta no grupo falhou (${why.join(' | ')}) id=${rec.presentation_id}`);
    return false;
  } catch (e: any) {
    logger.warn(`[presentationPublisher] resposta no grupo falhou (${e?.message}) id=${rec.presentation_id}`);
    return false;
  }
}

/**
 * Retenta publicações pendentes (status 'consolidated' ou 'failed').
 * Chamada periodicamente ou após reconnect.
 */
export async function retryPending(bot: any): Promise<{ ok: number; fail: number }> {
  const pending = await listPending();
  let ok = 0, fail = 0;
  for (const rec of pending) {
    // INC-021: retry também publica COM foto — url quando existe, senão o
    // mesmo picsum determinístico do caminho principal (consistência entre
    // canais; o buffer de photo_source 'sent' exige sock e não é do escopo
    // do retry).
    const photo = rec.photo_source === 'url' && rec.photo_ref
      ? { url: rec.photo_ref }
      : { url: picsumFor(rec) };
    const id = await publishToTelegram(rec, bot, undefined, undefined, photo);
    if (id) ok++; else fail++;
  }
  return { ok, fail };
}

/** Estatísticas para diagnóstico. */
export async function stats(): Promise<{ total: number; published: number; pending: number; failed: number }> {
  const db = await getDb();
  const total: any = await db.get(`SELECT COUNT(*) as n FROM presentations`);
  const published: any = await db.get(`SELECT COUNT(*) as n FROM presentations WHERE status='published'`);
  const failed: any = await db.get(`SELECT COUNT(*) as n FROM presentations WHERE status='failed'`);
  return {
    total: total?.n ?? 0,
    published: published?.n ?? 0,
    pending: (total?.n ?? 0) - (published?.n ?? 0),
    failed: failed?.n ?? 0,
  };
}
