/**
 * presentationPublisher — publica apresentações no Telegram (tópico 2).
 *
 * O Telegram é ESPELHO. O SQLite é a fonte oficial. Se o Telegram cair, a
 * apresentação fica com status 'failed' e é retentada depois — nunca se perde.
 *
 * Destino fixo (Comunidade 085):
 *   chat_id  = -1003470059875   (Fortaleza 085)
 *   thread_id = 2               (Apresentações)
 *
 * Se a apresentação já tem `tg_message_id`, a atualização EDITA a mensagem
 * existente — não cria duplicata.
 */
import { getDb } from './databaseService';
import { markPublished, markFailed, listPending, type PresentationRecord } from './presentationService';
import logger from './loggerService';

export const TG_CHAT_ID = '-1003470059875';
export const TG_THREAD_ID = '2';

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
 * @returns o messageId da mensagem publicada/editada, ou null se falhou.
 */
export async function publishToTelegram(
  rec: PresentationRecord,
  bot: any,
  groupName?: string,
  groupLink?: string,
): Promise<string | null> {
  const text = formatPresentation(rec, groupName, groupLink);

  try {
    // Se já existe mensagem no Telegram → EDITAR (não duplica)
    if (rec.tg_message_id) {
      await bot.telegram.editMessageText(
        Number(TG_CHAT_ID),
        Number(rec.tg_message_id),
        undefined,
        text,
        { parse_mode: 'Markdown', disable_web_page_preview: true, message_thread_id: Number(TG_THREAD_ID) } as any
      );
      logger.info('[presentationPublisher] mensagem editada', {
        presentationId: rec.presentation_id, tgMessageId: rec.tg_message_id,
      });
      return rec.tg_message_id;
    }

    // Primeira publicação
    const sent = await bot.telegram.sendMessage(Number(TG_CHAT_ID), text, {
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
      message_thread_id: Number(TG_THREAD_ID),
    } as any);

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
    logger.warn('[presentationPublisher] falha ao publicar', {
      presentationId: rec.presentation_id, error: e?.message,
    });
    return null;
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
    const id = await publishToTelegram(rec, bot);
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
