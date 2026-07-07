/**
 * Testes do messageHandler — cobre casos reais de falha:
 * - Comando legítimo NÃO deve passar pela moderação
 * - Mensagem normal DEVE passar pela moderação
 * - Comando inexistente não deve crashar
 * - Erro no comando deve ser capturado e respondido
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processMessage } from '../../src/services/messageHandler';
import * as moderationService from '../../src/services/moderationService';
import * as keywordHandler from '../../src/services/keywordHandler';

vi.mock('../../src/services/moderationService', () => ({
  handleModeration: vi.fn().mockResolvedValue(false),
}));

vi.mock('../../src/services/keywordHandler', () => ({
  handleKeywords: vi.fn().mockResolvedValue(false),
}));

vi.mock('axios', () => ({
  default: { get: vi.fn().mockResolvedValue({ data: { success: false } }) },
}));

describe('messageHandler — roteamento de comandos', () => {
  let mockClient: any;
  let mockCommands: Map<string, any>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = {};
    mockCommands = new Map();
    mockCommands.set('ping', {
      name: 'ping',
      execute: vi.fn().mockResolvedValue(undefined),
    });
  });

  it('comando legítimo ($ping) NÃO passa pela moderação', async () => {
    const msg = { body: '$ping', from: 'user@c.us', reply: vi.fn() };
    await processMessage(msg, mockClient, mockCommands);

    expect(moderationService.handleModeration).not.toHaveBeenCalled();
    expect(keywordHandler.handleKeywords).not.toHaveBeenCalled();
    expect(mockCommands.get('ping').execute).toHaveBeenCalledOnce();
  });

  it('mensagem normal passa pela moderação e keyword handler', async () => {
    const msg = { body: 'olá tudo bem', from: 'user@c.us', reply: vi.fn() };
    await processMessage(msg, mockClient, mockCommands);

    expect(moderationService.handleModeration).toHaveBeenCalledOnce();
    expect(keywordHandler.handleKeywords).toHaveBeenCalledOnce();
    expect(mockCommands.get('ping').execute).not.toHaveBeenCalled();
  });

  it('moderação bloqueando mensagem interrompe o fluxo antes do keywordHandler', async () => {
    vi.mocked(moderationService.handleModeration).mockResolvedValueOnce(true);
    const msg = { body: 'link bet365.com', from: 'user@c.us', reply: vi.fn() };
    await processMessage(msg, mockClient, mockCommands);

    expect(moderationService.handleModeration).toHaveBeenCalledOnce();
    expect(keywordHandler.handleKeywords).not.toHaveBeenCalled();
  });

  it('comando inexistente não crasha e não chama comandos conhecidos', async () => {
    const msg = {
      body: '$comandoQueNaoExiste',
      from: 'user@c.us',
      reply: vi.fn(),
      getChat: vi.fn().mockResolvedValue({ isGroup: false }),
    };
    await expect(processMessage(msg, mockClient, mockCommands)).resolves.toBeUndefined();
    expect(mockCommands.get('ping').execute).not.toHaveBeenCalled();
  });

  it('erro no execute do comando é capturado e responde ao usuário', async () => {
    mockCommands.get('ping').execute.mockRejectedValueOnce(new Error('falha interna'));
    const msg = { body: '$ping', from: 'user@c.us', reply: vi.fn() };
    await processMessage(msg, mockClient, mockCommands);

    expect(msg.reply).toHaveBeenCalledWith(expect.stringContaining('erro'));
  });

  it('mensagem vazia não crasha', async () => {
    const msg = { body: '', from: 'user@c.us', reply: vi.fn() };
    await expect(processMessage(msg, mockClient, mockCommands)).resolves.toBeUndefined();
  });

  it('prefixo $ com espaço é tratado como comando (espaço é removido)', async () => {
    const msg = { body: '$ ping', from: 'user@c.us', reply: vi.fn() };
    await processMessage(msg, mockClient, mockCommands);
    // "$ ping" é normalizado para "ping" (espaço removido pelo trim)
    expect(mockCommands.get('ping').execute).toHaveBeenCalledOnce();
  });

  it('comando em maiúsculo é normalizado ($PING → ping)', async () => {
    const msg = { body: '$PING', from: 'user@c.us', reply: vi.fn() };
    await processMessage(msg, mockClient, mockCommands);
    expect(mockCommands.get('ping').execute).toHaveBeenCalledOnce();
  });
});
