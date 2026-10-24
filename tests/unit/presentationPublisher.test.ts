/**
 * O destino da apresentação no Telegram: env acima de tudo, hardcoded como
 * fallback. E a foto: sendPhoto com legenda — nunca texto puro quando existe.
 *
 * As constantes de destino são lidas no import, então cada cenário reseta os
 * módulos com o env que quer provar.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const markPublished = vi.fn(async (_id: string, _chat: any, _thread: any, _msgId: string) => {});
const markFailed = vi.fn(async (_id: string) => {});

vi.mock('../../src/services/presentationService', () => ({
  markPublished,
  markFailed,
  listPending: vi.fn(async () => []),
}));
vi.mock('../../src/services/databaseService', () => ({
  getDb: vi.fn(async () => ({ get: async () => ({ n: 0 }) })),
}));
vi.mock('../../src/services/loggerService', () => ({
  default: { info: () => {}, warn: () => {}, error: () => {} },
  logInfo: () => {}, logWarning: () => {}, logError: () => {},
}));

const rec: any = {
  presentation_id: 'p1',
  nome: 'João',
  idade: 30,
  trabalho: 'TI',
  phone_number: '5585999999999',
  tg_message_id: null,
};

function botFake(): any {
  return {
    telegram: {
      sendMessage: vi.fn(async () => ({ message_id: 111 })),
      sendPhoto: vi.fn(async () => ({ message_id: 222 })),
      editMessageText: vi.fn(async () => ({})),
      editMessageCaption: vi.fn(async () => ({})),
      deleteMessage: vi.fn(async () => ({})),
    },
  };
}

/** Importa o publisher com o env do momento — as consts nascem no import. */
async function publisher() {
  vi.resetModules();
  return import('../../src/services/presentationPublisher');
}

describe('presentationPublisher — destino por env e foto', () => {
  beforeEach(() => {
    markPublished.mockClear();
    markFailed.mockClear();
    delete process.env.TELEGRAM_PRESENTATION_CHAT_ID;
    delete process.env.TELEGRAM_PRESENTATION_THREAD_ID;
  });

  it('usa TELEGRAM_PRESENTATION_CHAT_ID quando o env define o destino', async () => {
    process.env.TELEGRAM_PRESENTATION_CHAT_ID = '146078742';
    process.env.TELEGRAM_PRESENTATION_THREAD_ID = '';
    const pub = await publisher();
    const bot = botFake();

    const id = await pub.publishToTelegram(rec, bot);

    expect(id).toBe('111');
    expect(bot.telegram.sendMessage).toHaveBeenCalledWith(146078742, expect.any(String), expect.anything());
    // Privado não tem tópico: a chave some em vez de virar 0.
    const extra = bot.telegram.sendMessage.mock.calls[0][2];
    expect(extra.message_thread_id).toBeUndefined();
    expect(bot.telegram.sendPhoto).not.toHaveBeenCalled();
    expect(markPublished).toHaveBeenCalledWith('p1', '146078742', '', '111');
  });

  it('sem env, cai no grupo Fortaleza com tópico 2 (fallback histórico)', async () => {
    const pub = await publisher();
    const bot = botFake();

    await pub.publishToTelegram(rec, bot);

    expect(bot.telegram.sendMessage).toHaveBeenCalledWith(-1003470059875, expect.any(String), expect.anything());
    expect(bot.telegram.sendMessage.mock.calls[0][2].message_thread_id).toBe(2);
    expect(markPublished).toHaveBeenCalledWith('p1', '-1003470059875', '2', '111');
  });

  it('env vazio de chat cai no fallback (pm2 merge deixa var vazia)', async () => {
    process.env.TELEGRAM_PRESENTATION_CHAT_ID = '';
    const pub = await publisher();
    const bot = botFake();

    await pub.publishToTelegram(rec, bot);

    // '' não pode virar Number('')=NaN: publica no grupo de fallback.
    expect(bot.telegram.sendMessage).toHaveBeenCalledWith(-1003470059875, expect.any(String), expect.anything());
  });

  it('com foto, publica sendPhoto com legenda e não sendMessage', async () => {
    process.env.TELEGRAM_PRESENTATION_CHAT_ID = '146078742';
    const pub = await publisher();
    const bot = botFake();

    const id = await pub.publishToTelegram(rec, bot, undefined, undefined, {
      url: 'https://exemplo/foto.jpg',
    });

    expect(id).toBe('222');
    expect(bot.telegram.sendPhoto).toHaveBeenCalledWith(
      146078742,
      'https://exemplo/foto.jpg',
      expect.objectContaining({ caption: expect.stringContaining('João') }),
    );
    expect(bot.telegram.sendMessage).not.toHaveBeenCalled();
  });

  it('com foto em buffer, envia os bytes', async () => {
    const pub = await publisher();
    const bot = botFake();
    const bytes = Buffer.from([1, 2, 3]);

    await pub.publishToTelegram(rec, bot, undefined, undefined, { buffer: bytes });

    expect(bot.telegram.sendPhoto).toHaveBeenCalledWith(-1003470059875, bytes, expect.anything());
  });

  it('edit de publicação com foto edita a legenda, não o texto', async () => {
    const pub = await publisher();
    const bot = botFake();

    await pub.publishToTelegram({ ...rec, tg_message_id: '55' }, bot, undefined, undefined, {
      url: 'https://x/f.jpg',
    });

    expect(bot.telegram.editMessageCaption).toHaveBeenCalled();
    expect(bot.telegram.editMessageText).not.toHaveBeenCalled();
  });

  it('falha do Telegram marca failed e devolve null sem lançar', async () => {
    process.env.TELEGRAM_PRESENTATION_CHAT_ID = '146078742';
    const pub = await publisher();
    const bot = botFake();
    bot.telegram.sendMessage.mockRejectedValueOnce(new Error('429'));

    const id = await pub.publishToTelegram(rec, bot);

    expect(id).toBeNull();
    expect(markFailed).toHaveBeenCalledWith('p1');
  });

  it('INC-021: picsumFor — seed determinístico (número > user_id > default)', async () => {
    const pub = await publisher();
    expect(pub.picsumFor({ ...rec, phone_number: '5585999999999' }))
      .toBe('https://picsum.photos/seed/5585999999999/512/512');
    expect(pub.picsumFor({ ...rec, phone_number: undefined, user_id: '72576558715022@lid' }))
      .toBe('https://picsum.photos/seed/72576558715022/512/512');
  });

  it('INC-021: edit texto→foto (msg antiga sem caption) → apaga a antiga e re-publica COM foto (não duplica)', async () => {
    const pub = await publisher();
    const bot = botFake();
    // msg 217 é TEXTO puro: editMessageCaption falha como no Telegram real
    bot.telegram.editMessageCaption
      .mockRejectedValueOnce(new Error('Bad Request: there is no caption in the message to edit'));

    const id = await pub.publishToTelegram({ ...rec, tg_message_id: '217' }, bot, undefined, undefined, {
      url: 'https://picsum.photos/seed/5585999999999/512/512',
    });

    // apagou a antiga e re-publicou como foto com o novo id
    expect(bot.telegram.deleteMessage).toHaveBeenCalledWith(expect.any(Number), 217);
    expect(bot.telegram.sendPhoto).toHaveBeenCalled();
    expect(bot.telegram.sendPhoto.mock.calls[0][1]).toBe('https://picsum.photos/seed/5585999999999/512/512');
    expect(id).toBe('222');
    // o novo id foi gravado de volta no registro
    expect(markPublished).toHaveBeenCalled();
    expect(markPublished.mock.calls.at(-1)?.[3]).toBe('222');
    expect(markFailed).not.toHaveBeenCalled();
  });

  it('INC-021: edit com erro NÃO recuperável (429) → re-lança, marca failed, NÃO apaga', async () => {
    const pub = await publisher();
    const bot = botFake();
    bot.telegram.editMessageCaption.mockRejectedValueOnce(new Error('429'));

    const id = await pub.publishToTelegram({ ...rec, tg_message_id: '217' }, bot, undefined, undefined, {
      url: 'https://picsum.photos/seed/5585999999999/512/512',
    });

    expect(bot.telegram.deleteMessage).not.toHaveBeenCalled();
    expect(bot.telegram.sendPhoto).not.toHaveBeenCalled();
    expect(id).toBeNull();
    expect(markFailed).toHaveBeenCalledWith('p1');
  });
});
