import { ICommand } from './types';
import fs from 'fs';
import path from 'path';

// Armazena listas por grupo: { groupId: { lista1: [...], lista2: [...], lista3: [...] } }
const groupLists: Map<string, { lista1: string[]; lista2: string[]; lista3: string[] }> = new Map();
const LISTS_FILE = path.join(process.cwd(), 'data', 'group-lists.json');

// Carrega listas salvas
function loadLists() {
  try {
    if (fs.existsSync(LISTS_FILE)) {
      const data = fs.readFileSync(LISTS_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      Object.keys(parsed).forEach(key => {
        groupLists.set(key, parsed[key]);
      });
    }
  } catch (error) {
    console.error('[Lists] Erro ao carregar listas:', error);
  }
}

// Salva listas
function saveLists() {
  try {
    const dataDir = path.dirname(LISTS_FILE);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const obj: any = {};
    groupLists.forEach((value, key) => {
      obj[key] = value;
    });
    fs.writeFileSync(LISTS_FILE, JSON.stringify(obj, null, 2));
  } catch (error) {
    console.error('[Lists] Erro ao salvar listas:', error);
  }
}

// Inicializa listas de um grupo se não existir
function initGroupLists(groupId: string) {
  if (!groupLists.has(groupId)) {
    groupLists.set(groupId, { lista1: [], lista2: [], lista3: [] });
  }
}

// Carrega ao iniciar
loadLists();

// Função helper para criar comandos de lista
function createListCommand(listName: 'lista1' | 'lista2' | 'lista3'): ICommand {
  return {
    name: listName,
    description: `Exibe a ${listName}`,
    
    async execute(msg, client, args) {
      try {
        const chat = await msg.getChat();
        if (!chat.isGroup) {
          await msg.reply('❌ Este comando só funciona em grupos.');
          return;
        }

        const groupId = chat.id._serialized;
        initGroupLists(groupId);
        const lists = groupLists.get(groupId)!;
        const list = lists[listName];

        if (list.length === 0) {
          await msg.reply(`📋 ${listName.toUpperCase()} está vazia.\n\nUse $${listName}add <item> para adicionar.`);
        } else {
          const formatted = list.map((item, idx) => `${idx + 1}. ${item}`).join('\n');
          await msg.reply(`📋 ${listName.toUpperCase()}:\n\n${formatted}`);
        }

      } catch (error: any) {
        console.error(`[Lists] Erro em ${listName}:`, error);
        await msg.reply(`❌ Erro: ${error.message}`);
      }
    }
  };
}

function createListAddCommand(listName: 'lista1' | 'lista2' | 'lista3'): ICommand {
  return {
    name: `${listName}add`,
    description: `Adiciona um item na ${listName}`,
    
    async execute(msg, client, args) {
      try {
        const chat = await msg.getChat();
        if (!chat.isGroup) {
          await msg.reply('❌ Este comando só funciona em grupos.');
          return;
        }

        if (args.length === 0) {
          await msg.reply(`❌ Use: $${listName}add <item>`);
          return;
        }

        const groupId = chat.id._serialized;
        initGroupLists(groupId);
        const lists = groupLists.get(groupId)!;
        
        const item = args.join(' ');
        lists[listName].push(item);
        saveLists();

        await msg.reply(`✅ Item adicionado à ${listName.toUpperCase()}!\n\n"${item}"`);

      } catch (error: any) {
        console.error(`[Lists] Erro em ${listName}add:`, error);
        await msg.reply(`❌ Erro: ${error.message}`);
      }
    }
  };
}

function createListDelCommand(listName: 'lista1' | 'lista2' | 'lista3'): ICommand {
  return {
    name: `${listName}del`,
    description: `Apaga toda a ${listName}`,
    
    async execute(msg, client, args) {
      try {
        const chat = await msg.getChat();
        if (!chat.isGroup) {
          await msg.reply('❌ Este comando só funciona em grupos.');
          return;
        }

        // Verificar se é admin
        const participants = chat.participants || [];
        const senderId = msg.author || msg.from;
        const senderParticipant = participants.find((p: any) => 
          p.id?._serialized === senderId || p.id === senderId
        );
        
        const isAdmin = senderParticipant?.isAdmin || senderParticipant?.isSuperAdmin;
        
        if (!isAdmin) {
          await msg.reply('❌ Apenas administradores podem apagar listas.');
          return;
        }

        const groupId = chat.id._serialized;
        initGroupLists(groupId);
        const lists = groupLists.get(groupId)!;
        
        const itemCount = lists[listName].length;
        lists[listName] = [];
        saveLists();

        await msg.reply(`🗑️ ${listName.toUpperCase()} apagada! (${itemCount} itens removidos)`);

      } catch (error: any) {
        console.error(`[Lists] Erro em ${listName}del:`, error);
        await msg.reply(`❌ Erro: ${error.message}`);
      }
    }
  };
}

function createListEditCommand(listName: 'lista1' | 'lista2' | 'lista3'): ICommand {
  return {
    name: `${listName}edit`,
    description: `Edita toda a ${listName} (substitui completamente)`,
    
    async execute(msg, client, args) {
      try {
        const chat = await msg.getChat();
        if (!chat.isGroup) {
          await msg.reply('❌ Este comando só funciona em grupos.');
          return;
        }

        // Verificar se é admin
        const participants = chat.participants || [];
        const senderId = msg.author || msg.from;
        const senderParticipant = participants.find((p: any) => 
          p.id?._serialized === senderId || p.id === senderId
        );
        
        const isAdmin = senderParticipant?.isAdmin || senderParticipant?.isSuperAdmin;
        
        if (!isAdmin) {
          await msg.reply('❌ Apenas administradores podem editar listas.');
          return;
        }

        if (args.length === 0) {
          await msg.reply(
            `❌ Use: $${listName}edit <item1> | <item2> | <item3>\n\n` +
            `Exemplo: $${listName}edit Comprar pão | Estudar | Fazer exercício`
          );
          return;
        }

        const groupId = chat.id._serialized;
        initGroupLists(groupId);
        const lists = groupLists.get(groupId)!;
        
        // Split por | ou quebra de linha
        const fullText = args.join(' ');
        const items = fullText.split(/\s*\|\s*|\n/).filter(item => item.trim());
        
        lists[listName] = items;
        saveLists();

        const formatted = items.map((item, idx) => `${idx + 1}. ${item}`).join('\n');
        await msg.reply(
          `✅ ${listName.toUpperCase()} atualizada!\n\n` +
          `📋 Nova lista:\n${formatted}`
        );

      } catch (error: any) {
        console.error(`[Lists] Erro em ${listName}edit:`, error);
        await msg.reply(`❌ Erro: ${error.message}`);
      }
    }
  };
}

// Exporta todos os comandos de lista
export const lista1Command = createListCommand('lista1');
export const lista1AddCommand = createListAddCommand('lista1');
export const lista1DelCommand = createListDelCommand('lista1');
export const lista1EditCommand = createListEditCommand('lista1');

export const lista2Command = createListCommand('lista2');
export const lista2AddCommand = createListAddCommand('lista2');
export const lista2DelCommand = createListDelCommand('lista2');
export const lista2EditCommand = createListEditCommand('lista2');

export const lista3Command = createListCommand('lista3');
export const lista3AddCommand = createListAddCommand('lista3');
export const lista3DelCommand = createListDelCommand('lista3');
export const lista3EditCommand = createListEditCommand('lista3');
