import { ICommand } from './types';
import { CommandContext } from '../types';

// Importar todos os comandos
import { helpCommand } from './help';
import { menuCommand } from './menu';
import { pingCommand } from './ping';
import { aliveCommand } from './alive';
import { banCommand } from './ban';
import { kickCommand } from './kick';
import { muteCommand } from './mute';
import { promoteCommand } from './promover';
import { forcaCommand } from './forca';
import { velhaCommand } from './velha';
import { sorteioCommand } from './sorteio';
import { climaCommand } from './clima';
import { feedbackCommand } from './feedback';
import { statsCommand } from './stats';
import { perguntaCommand } from './pergunta';
import { nickCommand } from './nick';
import { gttsCommand } from './gtts';
import { ondeEstouCommand } from './ondeestou';
import { jogosCommand } from './jogos';
import { jokesCommand } from './jokes';
import { voteCommand } from './vote';
import { delVoteCommand } from './vote';
import { addCmdCommand } from './addcmd';
import { sendMessageCommand } from './sendMessage';
import { antispamCommand } from './antispam';
import { conselhoCommand } from './conselho';
import { conselhobCommand } from './conselhob';
import { aleatoriaCommand } from './aleatoria';
import { alarmeCommand } from './alarme';
import { lembreteCommand } from './lembrete';
import { shutdownCommand } from './shutdown';
import { infoCommand } from './info';
import { adminCommand } from './admin';
import { gruposCommand } from './grupos';
import { noticiasCommand } from './noticias';
import { banidosCommand } from './banidos';
import { setwelcomeCommand } from './setwelcome';
import { cantadaCommand } from './cantada';
import { cmdToggleCommand } from './cmdToggle';
import { automodCommand, antispamModCommand, antiestrangeiroModCommand, autolinkModCommand, bemvindoModCommand, detectarModCommand, removerModCommand } from './modToggle';

// Comandos registrados
const commands: Record<string, ICommand> = {
  help: helpCommand,
  menu: menuCommand,
  ping: pingCommand,
  alive: aliveCommand,
  ban: banCommand,
  kick: kickCommand,
  mute: muteCommand,
  promover: promoteCommand,
  'forca': forcaCommand,
  'velha': velhaCommand,
  'sorteio': sorteioCommand,
  clima: climaCommand,
  feedback: feedbackCommand,
  stats: statsCommand,
  pergunta: perguntaCommand,
  nick: nickCommand,
  gtts: gttsCommand,
  'ondeestou': ondeEstouCommand,
  jogos: jogosCommand,
  jokes: jokesCommand,
  piada: jokesCommand,
  vote: voteCommand,
  votar: voteCommand,
  delvote: delVoteCommand,
  voto: voteCommand,
  delvoto: delVoteCommand,
  addcmd: addCmdCommand,
  sendmsg: sendMessageCommand,
  ratelimit: antispamCommand,
  conselho: conselhoCommand,
  conselhob: conselhobCommand,
  aleatoria: aleatoriaCommand,
  alarme: alarmeCommand,
  lembrete: lembreteCommand,
  shutdown: shutdownCommand,
  info: infoCommand,
  admin: adminCommand,
  grupos: gruposCommand,
  noticias: noticiasCommand,
  banidos: banidosCommand,
  setwelcome: setwelcomeCommand,
  cantada: cantadaCommand,
  cmdtoggle: cmdToggleCommand,
  automod: automodCommand,
  antispam: antispamModCommand,
  antiestrangeiro: antiestrangeiroModCommand,
  autolink: autolinkModCommand,
  detectar: detectarModCommand,
  remover: removerModCommand,
};

// Registrar comandos personalizados
import { getComandoBlock, addComandosId, addComandos, getComando, listComandos, removeComando } from './customCommandsStore';

// Função principal para obter comando
export function getCommand(name: string): ICommand | undefined {
  const command = commands[name.toLowerCase()];
  if (command) {
    return command;
  }
  
  // Buscar comando personalizado
  return undefined;
}

// Função para obter lista de comandos
export function getCommandsList(): { name: string; description: string }[] {
  const list = Object.entries(commands).map(([name, cmd]) => ({
    name,
    description: cmd.description
  }));
  
  return list;
}

// Função para executar comando
export async function executeCommand(name: string, ctx: CommandContext): Promise<void> {
  const command = getCommand(name);
  if (!command) {
    console.warn(`Comando "${name}" não encontrado`);
    return;
  }
  
  await command.execute(ctx);
}

// Comandos especiais de system
export function getSystemCommands(): string[] {
  return ['shutdown', 'admin'];
}

// Exportar loadCommands para compatibilidade com PlatformManager
// CORREÇÃO: Retornar Map<string, ICommand> em vez de Record para compatibilidade com for...of
export function loadCommands(): Map<string, ICommand> {
  const commandsMap = new Map<string, ICommand>();
  for (const [name, command] of Object.entries(commands)) {
    commandsMap.set(name, command);
  }
  return commandsMap;
}

// Criar objeto de mensagem legado compatível com whatsapp-web.js
// CORREÇÃO: Preservar msg.author e msg.userId - NUNCA substituir pelo ID do grupo
function createLegacyMessage(msg: any, ctx: any): any {
  console.log('[createLegacyMessage] msg recebido:', {
    id: msg?.id,
    chatId: msg?.chatId,
    userId: msg?.userId,
    author: msg?.author,
    text: msg?.text,
    platform: msg?.platform
  });
  
  if (!msg) {
    console.error('[createLegacyMessage] msg é null/undefined');
    return {} as any;
  }
  
  // VALIDAÇÃO CRÍTICA: msg.author e msg.userId devem ser preservados
  // Não devem ser substituídos pelo ID do grupo
  const originalAuthor = msg.author;
  const originalUserId = msg.userId;
  
  // Objeto base compatível com whatsapp-web.js
  const legacyMsg: any = {
    id: msg.id,
    from: msg.chatId?.replace(/^(wpp:|tg:|dc:)/, '') || msg.chatId,
    to: msg.chatId?.replace(/^(wpp:|tg:|dc:)/, '') || msg.chatId,
    // CORREÇÃO: Usar msg.author e msg.userId diretamente, sem substituição
    author: originalAuthor?.replace(/^(wpp:|tg:|dc:)/, '') || originalAuthor,
    body: msg.text,
    timestamp: msg.timestamp instanceof Date ? Math.floor(msg.timestamp.getTime() / 1000) : Math.floor(Date.now() / 1000),
    fromMe: msg.isFromMe,
    hasMedia: msg.hasMedia,
    type: msg.mediaType,
    mentionedIds: msg.raw?.mentionedIds || [],
    _data: { notifyName: msg.userName },
  };
  
  console.log('[createLegacyMessage] legacyMsg criado:', {
    id: legacyMsg.id,
    from: legacyMsg.from,
    to: legacyMsg.to,
    author: legacyMsg.author,
    userIdPreserved: legacyMsg.author === originalAuthor || (originalAuthor && originalAuthor.includes(legacyMsg.author))
  });

  // Método reply unificado e robusto
  const robustReply = async (text: string, options?: any) => {
    console.log(`[LegacyMessage] robustReply() chamado - text: "${text.substring(0, 50)}..." msg.chatId: ${msg.chatId} msg.platform: ${msg.platform}`);
    try {
      // Prioridade 1: ctx.reply (método direto do adaptador)
      if (ctx && typeof ctx.reply === 'function') {
        console.log('[LegacyMessage] Usando ctx.reply()');
        return await ctx.reply(text, options);
      }
      // Prioridade 2: client.sendMessage via msg.chatId
      if (ctx && ctx.client && typeof ctx.client.sendMessage === 'function') {
        console.log('[LegacyMessage] Usando ctx.client.sendMessage()');
        return await ctx.client.sendMessage(msg.chatId, text, options);
      }
      // Prioridade 3: Envio direto pelo adaptador do WhatsApp se for a plataforma
      if (msg.platform === 'whatsapp') {
        console.log('[LegacyMessage] Usando whatsAppClient.sendMessage()');
        const { whatsAppClient } = await import('../../platforms/whatsapp/WhatsAppAdapter');
        return await whatsAppClient.sendMessage(msg.chatId, text, options);
      }
      // Fallback extremo via PlatformManager
      console.log('[LegacyMessage] Usando PlatformManager.sendMessage()');
      const { platformManager: pm } = await import('../../platforms/PlatformManager');
      return await pm.getInstance().sendMessage(msg.platform, msg.chatId, text, options);
    } catch (err) {
      console.error('[LegacyMessage] Falha crítica ao responder:', err);
    }
  };

  legacyMsg.reply = robustReply;
  // Garantir que delete() também funcione para comandos de moderação
  legacyMsg.delete = async (everyone: boolean = true) => {
    try {
      if (msg.raw && typeof msg.raw.delete === 'function') {
        return await msg.raw.delete(everyone);
      }
    } catch (err) {
      console.error('[LegacyMessage] Erro ao deletar mensagem:', err);
    }
  };

  legacyMsg.getChat = async () => {
    try {
      if (ctx && typeof ctx.getChat === 'function') {
        const chat = await ctx.getChat();
        return chat.raw || chat;
      }
    } catch (err) {
      console.error('[LegacyMessage] Erro ao obter chat:', err);
    }
    return { 
      id: { _serialized: legacyMsg.from },
      isGroup: msg.raw?.isGroup || false,
      participants: []
    };
  };

  legacyMsg.getQuotedMessage = async () => {
    try {
      if (msg.raw && msg.raw.hasQuotedMsg) {
        const quotedMsg = msg.raw.quotedMsg;
        if (quotedMsg) {
          // Criar mensagem citada legada preservando author e userId
          return {
            id: quotedMsg.id,
            from: quotedMsg.from,
            to: quotedMsg.to,
            author: quotedMsg.author || quotedMsg.from,
            body: quotedMsg.body || quotedMsg.text || '',
            timestamp: quotedMsg.timestamp,
            fromMe: quotedMsg.fromMe,
            hasMedia: quotedMsg.hasMedia,
            type: quotedMsg.type,
            mentionedIds: quotedMsg.mentionedIds || [],
            _data: { notifyName: quotedMsg.notifyName },
            delete: async (everyone: boolean = true) => {
              try {
                if (quotedMsg.delete) {
                  return await quotedMsg.delete(everyone);
                }
              } catch (err) {
                console.error('[LegacyMessage] Erro ao deletar mensagem citada:', err);
              }
            }
          };
        }
      }
    } catch (err) {
      console.error('[LegacyMessage] Erro ao obter mensagem citada:', err);
    }
    return null;
  };

  // Injetar em raw para compatibilidade profunda
  if (msg.raw) {
    legacyMsg.raw = { ...msg.raw };
    legacyMsg.raw.reply = robustReply;
  } else {
    legacyMsg.raw = { reply: robustReply };
  }

  return legacyMsg;
}

function createLegacyClient(client: any): any {
  return {
    sendMessage: async (chatId: string, text: string, options?: any) => {
      await client.sendMessage(chatId, text, options);
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
      return chats.map((c: any) => c.raw);
    },
    kick: async (userId: string) => {
      // Método legado usado em alguns comandos
      const { whatsAppClient } = await import('../../platforms/whatsapp/WhatsAppAdapter');
      const wppClient = whatsAppClient.getClient();
      // BUG 1: Eliminar chamada direta de getChatById - usar getChat em vez disso
      const chat = await wppClient.getChat(userId.includes('@g.us') ? userId : (await wppClient.getContactById(userId)).id._serialized);
      if (chat.isGroup) {
        await (chat as any).removeParticipants([userId]);
      }
    },
    info: {
      wid: { _serialized: client.userId },
      pushname: client.userName,
    },
  };
}

// Exportar comandos individuais para testes (formato legado)
export {
  helpCommand, menuCommand, pingCommand, aliveCommand, banCommand, kickCommand, muteCommand, promoteCommand,
  forcaCommand, velhaCommand, sorteioCommand, climaCommand, feedbackCommand, statsCommand, perguntaCommand,
  nickCommand, gttsCommand, ondeEstouCommand, jogosCommand, jokesCommand, voteCommand, delVoteCommand,
  addCmdCommand, antispamCommand, conselhoCommand, conselhobCommand, aleatoriaCommand,
  alarmeCommand, lembreteCommand, shutdownCommand, infoCommand, adminCommand,
  gruposCommand, noticiasCommand, banidosCommand, setwelcomeCommand, cantadaCommand,
  cmdToggleCommand, sendMessageCommand,
};