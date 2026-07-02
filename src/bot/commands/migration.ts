/**
 * 🔒 WarriorBlack - Command Migration Helpers
 *
 * Utilitários para migrar comandos legados (msg, client, args) para novo CommandContext
 */

import { ICommand, ILegacyCommand, LegacyCommandExecute } from './types';
import { CommandContext, PlatformMessage, PlatformClient, SendOptions } from '../../../platforms/base/PlatformTypes';

/**
 * Converte comando legado para novo formato
 */
export function migrateCommand(legacy: ILegacyCommand): ICommand {
  return {
    name: legacy.name,
    description: legacy.description,
    platforms: undefined, // Disponível em todas por padrão
    execute: async (ctx: CommandContext) => {
      // Criar objetos compatíveis com legado
      const legacyMsg = createLegacyMessage(ctx.msg);
      const legacyClient = createLegacyClient(ctx.client);
      await legacy.execute(legacyMsg, legacyClient, ctx.args);
    }
  };
}

/**
 * Cria objeto de mensagem compatível com código legado
 */
function createLegacyMessage(msg: PlatformMessage): any {
  return {
    id: msg.id,
    from: msg.chatId.replace(/^wpp:/, ''),
    to: msg.chatId.replace(/^wpp:/, ''),
    author: msg.userId.replace(/^wpp:/, ''),
    body: msg.text,
    timestamp: Math.floor(msg.timestamp.getTime() / 1000),
    fromMe: msg.isFromMe,
    hasMedia: msg.hasMedia,
    type: msg.mediaType,
    _data: {
      notifyName: msg.userName
    },
    reply: async (text: string, options?: any) => {
      // msg.reply no novo sistema é na verdade ctx.reply
      if (typeof (msg as any).reply === 'function') {
        return await (msg as any).reply(text, options);
      }
      // Se não, tentamos via client injetado no PlatformManager
      console.error('[Migration] msg.reply is not a function, check CommandContext');
    },
    getChat: async () => {
      const chat = await msg.getChat();
      return chat.raw;
    }
  };
}

/**
 * Cria objeto de cliente compatível com código legado
 */
function createLegacyClient(client: PlatformClient): any {
  return {
    sendMessage: async (chatId: string, text: string) => {
      await client.sendMessage(chatId, text);
    },
    getChatById: async (chatId: string) => {
      const chat = await client.getChat(chatId);
      return chat.raw;
    },
    getContactById: async (userId: string) => {
      const user = await client.getUser(userId);
      return user.raw;
    },
    getChats: async () => {
      const chats = await client.getChats();
      return chats.map(c => c.raw);
    },
    info: {
      wid: { _serialized: client.userId },
      pushname: client.userName
    }
  };
}

/**
 * Helper para comandos que precisam de reply simples
 */
export function createSimpleCommand(
  name: string,
  description: string,
  handler: (ctx: CommandContext) => Promise<string | void>
): ICommand {
  return {
    name,
    description,
    execute: async (ctx) => {
      const result = await handler(ctx);
      if (result) {
        await ctx.reply(result);
      }
    }
  };
}

/**
 * Helper para comandos com verificação de permissão
 */
export function createProtectedCommand(
  name: string,
  description: string,
  requiredLevel: 'master' | 'admin',
  handler: (ctx: CommandContext) => Promise<string | void>
): ICommand {
  return {
    name,
    description,
    execute: async (ctx) => {
      // A verificação real será feita pelo requirePermission no handler
      // Aqui apenas executamos
      const result = await handler(ctx);
      if (result) {
        await ctx.reply(result);
      }
    }
  };
}

/**
 * Adapter para usar serviços legados (DB, AI, etc) no novo contexto
 */
export function getLegacyServices() {
  // Retorna serviços que comandos legados esperam
  return {
    // Serão importados dinamicamente quando necessário
  };
}