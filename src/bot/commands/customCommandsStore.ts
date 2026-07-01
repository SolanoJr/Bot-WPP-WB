/**
 * Armazenamento local de comandos customizados por grupo.
 * Substitui a dependência do astabot (database/comandos.json).
 */

interface CustomCommand {
  id: string;
  comando: string;
  resposta: string;
}

interface GroupCommands {
  [groupId: string]: CustomCommand[];
}

const STORAGE_KEY = 'custom_commands';

function loadCommands(): GroupCommands {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
}

function saveCommands(commands: GroupCommands): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(commands));
  } catch (e) {
    console.error('Erro ao salvar comandos customizados:', e);
  }
}

// Para ambiente Node.js (não browser), usamos arquivo JSON
let nodeCache: GroupCommands | null = null;
const fs = require('fs');
const path = require('path');
const DATA_DIR = path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'custom_commands.json');

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadNodeCommands(): GroupCommands {
  if (nodeCache) return nodeCache;
  ensureDataDir();
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = fs.readFileSync(DATA_FILE, 'utf-8');
      nodeCache = JSON.parse(data);
    } else {
      nodeCache = {};
    }
  } catch {
    nodeCache = {};
  }
  return nodeCache;
}

function saveNodeCommands(commands: GroupCommands): void {
  ensureDataDir();
  nodeCache = commands;
  fs.writeFileSync(DATA_FILE, JSON.stringify(commands, null, 2), 'utf-8');
}

export function getComandoBlock(groupId: string): CustomCommand[] | null {
  const commands = typeof window !== 'undefined' ? loadCommands() : loadNodeCommands();
  return commands[groupId] || null;
}

export function addComandosId(groupId: string): void {
  const commands = typeof window !== 'undefined' ? loadCommands() : loadNodeCommands();
  if (!commands[groupId]) {
    commands[groupId] = [];
    if (typeof window !== 'undefined') {
      saveCommands(commands);
    } else {
      saveNodeCommands(commands);
    }
  }
}

export function addComandos(groupId: string, comando: string): void {
  const commands = typeof window !== 'undefined' ? loadCommands() : loadNodeCommands();
  if (!commands[groupId]) {
    commands[groupId] = [];
  }
  const newCmd: CustomCommand = {
    id: Date.now().toString(),
    comando,
    resposta: '', // resposta vazia por padrão
  };
  commands[groupId].push(newCmd);
  if (typeof window !== 'undefined') {
    saveCommands(commands);
  } else {
    saveNodeCommands(commands);
  }
}

export function getComando(groupId: string, comando: string): CustomCommand | undefined {
  const commands = typeof window !== 'undefined' ? loadCommands() : loadNodeCommands();
  const groupCmds = commands[groupId];
  if (!groupCmds) return undefined;
  return groupCmds.find(c => c.comando.toLowerCase() === comando.toLowerCase());
}

export function listComandos(groupId: string): CustomCommand[] {
  const commands = typeof window !== 'undefined' ? loadCommands() : loadNodeCommands();
  return commands[groupId] || [];
}

export function removeComando(groupId: string, comando: string): boolean {
  const commands = typeof window !== 'undefined' ? loadCommands() : loadNodeCommands();
  const groupCmds = commands[groupId];
  if (!groupCmds) return false;
  const idx = groupCmds.findIndex(c => c.comando.toLowerCase() === comando.toLowerCase());
  if (idx === -1) return false;
  groupCmds.splice(idx, 1);
  if (typeof window !== 'undefined') {
    saveCommands(commands);
  } else {
    saveNodeCommands(commands);
  }
  return true;
}