import { ICommand } from './types';
import logger from '../../services/loggerService';
import { isMaster } from '../../services/permissions';

/**
 * Command: $sendmsg <numero> <mensagem>
 * Envia uma mensagem direta para o número informado.
 * Exemplo de uso: $sendmsg 88998314322 oi
 */
export const sendMessageCommand: ICommand = {
  name: 'sendmsg',
  description: 'Envia uma mensagem para um número especificado.',
  async execute(ctx) {
    const authorId = ctx.userId;
    
    // Verificar se é MASTER
    if (!isMaster(authorId)) {
      await ctx.reply('❌ Apenas o MASTER do bot pode usar este comando.');
      return;
    }

    const [rawNumber, ...messageParts] = ctx.args;
    if (!rawNumber || messageParts.length === 0) {
      await ctx.reply('Uso: $sendmsg <numero> <mensagem>');
      return;
    }

    // Remove caracteres não numéricos e garante o formato do chatId do WhatsApp
    let number = rawNumber.replace(/[^0-9]/g, '');
    console.log('[SENDMSG] Número original:', rawNumber, '| Número limpo:', number, '| Comprimento:', number.length);
    
    // Adicionar código do país Brasil se não tiver
    if (number.length === 11) {
      number = '55' + number;
      console.log('[SENDMSG] Adicionou código do país:', number);
    }
    
    const message = messageParts.join(' ');
    let chatId = `${number}@c.us`;
    console.log('[SENDMSG] Chat ID inicial:', chatId);

    try {
      // Tentar obter o ID correto usando getNumberId
      try {
        const numberId = await (ctx.client as any).getNumberId(number);
        if (numberId) {
          chatId = numberId._serialized;
          console.log('[SENDMSG] ID obtido via getNumberId:', chatId);
        }
      } catch (e) {
        console.log('[SENDMSG] Erro ao usar getNumberId, usando formato padrão:', e);
      }

      // Tentar obter contato para verificar se existe
      try {
        const contact = await (ctx.client as any).getContactById(chatId);
        console.log('[SENDMSG] Contato encontrado:', contact.number || contact.id._serialized);
      } catch (e) {
        console.log('[SENDMSG] Contato não encontrado:', e);
      }

      await ctx.client.sendMessage(chatId, message);
      await ctx.reply(`✅ Mensagem enviada para ${rawNumber}`);
      logger.info(`Mensagem enviada para ${rawNumber}: ${message}`);
    } catch (e) {
      logger.error(`Erro ao enviar mensagem para ${rawNumber}: ${e}`);
      await ctx.reply('⚠️ Falha ao enviar a mensagem. Verifique se o número está correto e se o bot tem permissão para enviar mensagens para este contato.');
    }
  },
};
