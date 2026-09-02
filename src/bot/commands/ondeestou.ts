import { ICommand } from './types';

// Tipagem mínima para o registry global de chatIds em polling de localização.
declare global {
  // eslint-disable-next-line no-var
  var pendingChatIds: Set<string> | undefined;
}

export const ondeEstouCommand: ICommand = {
  name: 'ondeestou',
  description: 'Gera um link seguro para envio de localização.',
  async execute(ctx) {
    const chatId = ctx.chatId || (ctx as any).from || (ctx.msg as any)?.chatId;
    const interfaceUrl = process.env.LOCATION_INTERFACE_URL || 'https://bot-wpp-wb-sc.pages.dev';
    const relayUrl = (process.env.RELAY_URL && process.env.RELAY_URL.includes('bot-wpp-relay.onrender.com'))
      ? process.env.RELAY_URL
      : 'https://bot-wpp-relay.onrender.com';
    const token = `loc_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

    if (!chatId) {
      await ctx.reply('⚠️ Não consegui identificar este chat para gerar o link de localização.');
      return;
    }

    if (global.pendingChatIds && typeof global.pendingChatIds.add === 'function') {
      global.pendingChatIds.add(chatId);
      console.log(`📝 [ONDEESTOU] ChatId ${chatId} adicionado ao polling`);
    }

    const url = new URL(interfaceUrl);
    url.searchParams.set('token', token);
    url.searchParams.set('chatId', chatId);
    url.searchParams.set('warriorKey', process.env.WARRIOR_AUTH_KEY || '');
    url.searchParams.set('relay', relayUrl);

    const response = [
      '📍 *Solicitação de Localização*',
      '',
      'Para enviar sua localização em tempo real, clique no link abaixo:',
      '',
      `🔗 ${url.toString()}`,
      '',
      'O link expira assim que a localização for recebida.'
    ].join('\n');

    await ctx.reply(response);
  }
};
