import { ICommand } from './types';
import { platformManager } from '../../platforms/PlatformManager';
import { migrateCommand } from './migration';

// Importar comandos legados
import { helpCommand } from './help';
// Duplicate import removed
import { piadaCommand } from './piada';
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
import { sendMessageCommand } from './sendMessage';
import { ondeEstouCommand } from './ondeestou';
import { jogosCommand } from './jogos';
import { nickCommand } from './nick';
import { gttsCommand } from './gtts';
import { jokesCommand } from './jokes';
import { voteCommand, delVoteCommand, votoCommand } from './vote';
import { addCmdCommand } from './addcmd';
import { antispamCommand } from './antispam';
import { conselhoCommand } from './conselho';
import { conselhobCommand } from './conselhob';
import { aleatoriaCommand } from './aleatoria';
import { alarmeCommand } from './alarme';
import { lembreteCommand } from './lembrete';
import { bemvindoCommand } from './bemvindo';
import { shutdownCommand } from './shutdown';
import { infoCommand } from './info';
import { adminCommand } from './admin';
import { gruposCommand } from './grupos';
import { noticiasCommand } from './noticias';
import { banidosCommand } from './banidos';
import { setwelcomeCommand } from './setwelcome';
import { cantadaCommand, fakechatCommand } from './interacao';
import { cmdToggleCommand } from './cmdToggle';
import { welcomeCommand } from './welcome';
import {
  lista1Command, lista1AddCommand, lista1DelCommand, lista1EditCommand,
  lista2Command, lista2AddCommand, lista2DelCommand, lista2EditCommand,
  lista3Command, lista3AddCommand, lista3DelCommand, lista3EditCommand,
} from './lists';

// Lista de comandos legados para migrar
const legacyCommands: Array<{ name: string; description: string; execute: any }> = [
  { name: 'help', description: 'Lista os comandos disponíveis.', execute: helpCommand.execute },
  { name: 'menu', description: 'Menu principal.', execute: menuCommand.execute },
  { name: 'ping', description: 'Testa conexão.', execute: pingCommand.execute },
  { name: 'alive', description: 'Verifica se o bot está online.', execute: aliveCommand.execute },
  { name: 'ban', description: 'Bane usuário do grupo.', execute: banCommand.execute },
  { name: 'kick', description: 'Remove usuário do grupo.', execute: kickCommand.execute },
  { name: 'mute', description: 'Muta usuário no grupo.', execute: muteCommand.execute },
  { name: 'promover', description: 'Promove usuário a admin.', execute: promoteCommand.execute },
  { name: 'forca', description: 'Jogo da forca.', execute: forcaCommand.execute },
  { name: 'velha', description: 'Jogo da velha.', execute: velhaCommand.execute },
  { name: 'sorteio', description: 'Sorteio entre participantes.', execute: sorteioCommand.execute },
  { name: 'clima', description: 'Consulta clima.', execute: climaCommand.execute },
  { name: 'feedback', description: 'Envia feedback.', execute: feedbackCommand.execute },
  { name: 'stats', description: 'Estatísticas do bot.', execute: statsCommand.execute },
  { name: 'pergunta', description: 'Pergunta para a IA.', execute: perguntaCommand.execute },
  { name: 'nick', description: 'Altera apelido.', execute: nickCommand.execute },
  { name: 'gtts', description: 'Texto para fala.', execute: gttsCommand.execute },
  { name: 'ondeestou', description: 'Gera link de localização.', execute: ondeEstouCommand.execute },
  { name: 'jogos', description: 'Lista jogos.', execute: jogosCommand.execute },
  { name: 'jokes', description: 'Piadas aleatórias.', execute: jokesCommand.execute },
  { name: 'vote', description: 'Cria votação.', execute: voteCommand.execute },
  { name: 'delvote', description: 'Deleta votação.', execute: delVoteCommand.execute },
  { name: 'voto', description: 'Vota em opção.', execute: votoCommand.execute },
  { name: 'addcmd', description: 'Adiciona comando customizado.', execute: addCmdCommand.execute },
  { name: 'antispam', description: 'Configura anti-spam.', execute: antispamCommand.execute },
  { name: 'conselho', description: 'Conselho aleatório.', execute: conselhoCommand.execute },
  { name: 'conselhob', description: 'Conselho B.', execute: conselhobCommand.execute },
  { name: 'aleatoria', description: 'Escolha aleatória.', execute: aleatoriaCommand.execute },
  { name: 'alarme', description: 'Define alarme.', execute: alarmeCommand.execute },
  { name: 'lembrete', description: 'Define lembrete.', execute: lembreteCommand.execute },
  { name: 'bemvindo', description: 'Configura boas‑vindas.', execute: bemvindoCommand.execute },
  { name: 'shutdown', description: 'Desliga o bot (master).', execute: shutdownCommand.execute },
  { name: 'info', description: 'Info do bot/grupo.', execute: infoCommand.execute },
  { name: 'admin', description: 'Comandos de admin.', execute: adminCommand.execute },
  { name: 'grupos', description: 'Lista grupos.', execute: gruposCommand.execute },
  { name: 'noticias', description: 'Últimas notícias.', execute: noticiasCommand.execute },
  { name: 'banidos', description: 'Lista banidos.', execute: banidosCommand.execute },
  { name: 'setwelcome', description: 'Define mensagem de boas‑vindas.', execute: setwelcomeCommand.execute },
  { name: 'sendmsg', description: 'Envia uma mensagem direta para o número informado.', execute: sendMessageCommand.execute },
  { name: 'sendmsg', description: 'Envia uma mensagem direta para o número informado.', execute: sendMessageCommand.execute },
  { name: 'cantada', description: 'Cantada aleatória.', execute: cantadaCommand.execute },
  { name: 'fakechat', description: 'Fake chat.', execute: fakechatCommand.execute },
  { name: 'cmd', description: 'Ativa ou desativa comandos por grupo.', execute: cmdToggleCommand.execute },
  { name: 'piada', description: 'Piada aleatória.', execute: piadaCommand.execute },
  // Alias commands for vote functionality matching tests
  { name: 'votar', description: 'Cria votação.', execute: voteCommand.execute },
  { name: 'voto', description: 'Vota em opção.', execute: votoCommand.execute },
  { name: 'delvoto', description: 'Deleta votação.', execute: delVoteCommand.execute },
  // Welcome command
  { name: 'bemvindo', description: 'Configura mensagem de boas-vindas.', execute: welcomeCommand.execute },
  // List commands
  { name: 'lista1', description: 'Exibe lista 1.', execute: lista1Command.execute },
  { name: 'lista1add', description: 'Adiciona item na lista 1.', execute: lista1AddCommand.execute },
  { name: 'lista1del', description: 'Apaga lista 1.', execute: lista1DelCommand.execute },
  { name: 'lista1edit', description: 'Edita lista 1.', execute: lista1EditCommand.execute },
  { name: 'lista2', description: 'Exibe lista 2.', execute: lista2Command.execute },
  { name: 'lista2add', description: 'Adiciona item na lista 2.', execute: lista2AddCommand.execute },
  { name: 'lista2del', description: 'Apaga lista 2.', execute: lista2DelCommand.execute },
  { name: 'lista2edit', description: 'Edita lista 2.', execute: lista2EditCommand.execute },
  { name: 'lista3', description: 'Exibe lista 3.', execute: lista3Command.execute },
  { name: 'lista3add', description: 'Adiciona item na lista 3.', execute: lista3AddCommand.execute },
  { name: 'lista3del', description: 'Apaga lista 3.', execute: lista3DelCommand.execute },
  { name: 'lista3edit', description: 'Edita lista 3.', execute: lista3EditCommand.execute },
];

/**
 * Carrega e registra todos os comandos no PlatformManager
 */
export function loadCommands(): Map<string, ICommand> {
  const commands = new Map<string, ICommand>();

  console.log('[Commands] Carregando e registrando comandos...');

  for (const legacy of legacyCommands) {
    const migrated: ICommand = {
      name: legacy.name,
      description: legacy.description,
      platforms: undefined, // Disponível em todas as plataformas por padrão
      execute: async (ctxOrMsg: any, maybeClient?: any, maybeArgs?: any) => {
        // Se foi chamado pelo PlatformManager (um único argumento que é um CommandContext)
        // O CommandContext tem as propriedades 'msg', 'client' e 'args'
        const isContext = ctxOrMsg && typeof ctxOrMsg === 'object' && ('msg' in ctxOrMsg) && ('client' in ctxOrMsg);
        
        if (isContext) {
          const ctx = ctxOrMsg;
          const legacyMsg = createLegacyMessage(ctx.msg, ctx);
          const legacyClient = createLegacyClient(ctx.client);
          await legacy.execute(legacyMsg, legacyClient, ctx.args);
        } else {
          // Se foi chamado diretamente pelo messageHandler legado (msg, client, args)
          await legacy.execute(ctxOrMsg, maybeClient, maybeArgs);
        }
      },
    };

    commands.set(legacy.name, migrated);
    platformManager.registerCommand(migrated);
    console.log(`[Commands] ✅ Registrado: ${legacy.name}`);
  }

  console.log(`[Commands] Total: ${commands.size} comandos carregados`);
  return commands;
}

function createLegacyMessage(msg: any, ctx?: any): any {
  if (!msg) {
    // Guard clause for undefined message
    return {} as any;
  }
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
    _data: { notifyName: msg.userName },
    reply: async (text: string, options?: any) => {
      // Usar o reply do contexto se disponível, caso contrário tenta da mensagem
      if (ctx && ctx.reply) {
        await ctx.reply(text, options);
      } else if (msg.reply) {
        await msg.reply(text, options);
      } else {
        console.error('[createLegacyMessage] Nenhum método reply disponível');
      }
    },
    getChat: async () => {
      if (ctx && ctx.getChat) {
        const chat = await ctx.getChat();
        return chat.raw || chat;
      }
      return { id: msg.chatId };
    },
  };
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
  votoCommand, addCmdCommand, antispamCommand, conselhoCommand, conselhobCommand, aleatoriaCommand,
  alarmeCommand, lembreteCommand, bemvindoCommand, shutdownCommand, infoCommand, adminCommand,
  gruposCommand, noticiasCommand, banidosCommand, setwelcomeCommand, cantadaCommand, fakechatCommand,
  cmdToggleCommand,
};
