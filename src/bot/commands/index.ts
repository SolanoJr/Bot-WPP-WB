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
import { fakechatCommand } from './interacao';
import { sendCommand } from './send';
import { cmdToggleCommand } from './cmdToggle';
import { automodCommand, antispamModCommand, antiestrangeiroModCommand, autolinkModCommand, bemvindoModCommand, detectarModCommand, removerModCommand } from './modToggle';
import { screenCommand } from './screen';

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
  fakechat: fakechatCommand,
  send: sendCommand,
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
export function loadCommands(): Map<string, ICommand> {
  const commandsMap = new Map<string, ICommand>();
  for (const [name, command] of Object.entries(commands)) {
    commandsMap.set(name, command);
  }
  // Adicionar screen command
  commandsMap.set('screen', screenCommand);
  commandsMap.set('screenshare', screenCommand);
  commandsMap.set('share', screenCommand);
  return commandsMap;
}

export {
  helpCommand, menuCommand, pingCommand, aliveCommand, banCommand, kickCommand, muteCommand, promoteCommand,
  forcaCommand, velhaCommand, sorteioCommand, climaCommand, feedbackCommand, statsCommand, perguntaCommand,
  nickCommand, gttsCommand, ondeEstouCommand, jogosCommand, jokesCommand, voteCommand, delVoteCommand,
  addCmdCommand, antispamCommand, conselhoCommand, conselhobCommand, aleatoriaCommand,
  alarmeCommand, lembreteCommand, shutdownCommand, infoCommand, adminCommand,
  gruposCommand, noticiasCommand, banidosCommand, setwelcomeCommand, cantadaCommand, fakechatCommand, sendCommand,
  cmdToggleCommand, sendMessageCommand,
};
