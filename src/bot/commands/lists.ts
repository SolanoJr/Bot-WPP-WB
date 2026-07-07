import { ICommand } from './types';
import { CommandContext } from '../../../platforms/base/PlatformTypes';
import { cleanId, isMaster, isAdmin } from '../../services/permissions';
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

/**
 * Verificação robusta de permissão de admin (baseada no comando $ban)
 * Verifica: admin do grupo, MASTER, ou admin do .env
 */
async function checkAdminPermission(ctx: CommandContext): Promise<boolean> {
  // Se já for admin pelo contexto (do .env), permitir
  if (ctx.isAdmin) return true;
  
  // Se for MASTER, permitir sempre
  const rawUserId = ctx.userId.replace(/^(wpp:|tg:|dc:)/, '');
  if (isMaster(rawUserId)) return true;
  
  // Para WhatsApp, verificar admin do grupo
  if (ctx.platform === 'whatsapp' && ctx.isGroup) {
    try {
      const msg = ctx.msg.raw;
      const client = (ctx.client as any).getClient();
      
      const chat = await msg.getChat();
      const freshChat = await client.getChatById(chat.id._serialized);
      
      const participants = Array.isArray(freshChat?.participants)
        ? freshChat.participants
        : Array.isArray(freshChat?.groupMetadata?.participants)
          ? freshChat.groupMetadata.participants
          : [];
      
      const senderIdRaw = msg.author || msg.from;
      const senderId = cleanId(senderIdRaw);
      
      const senderParticipant = participants.find((p: any) => {
        const pId = p.id?._serialized || "";
        const pIdClean = cleanId(pId);
        const pLid = p.id?.lid || "";
        
        return pIdClean === senderId || 
               pId === senderIdRaw || 
               pIdClean === cleanId(senderIdRaw) ||
               (pLid && senderIdRaw.includes(pLid)) ||
               (pLid && pLid === senderIdRaw);
      });
      
      return Boolean(senderParticipant?.isAdmin || senderParticipant?.isSuperAdmin);
    } catch (error) {
      console.error('[Lists] Erro ao verificar admin do grupo:', error);
      return false;
    }
  }
  
  return false;
}

// Função helper para criar comandos de lista
function createListCommand(listName: 'lista1' | 'lista2' | 'lista3'): ICommand {
  return {
    name: listName,
    description: `Exibe a ${listName}`,

    async execute(ctx: CommandContext) {
      try {
        if (!ctx.isGroup) {
          await ctx.reply('❌ Este comando só funciona em grupos.');
          return;
        }

        const groupId = ctx.chatId;
        initGroupLists(groupId);
        const lists = groupLists.get(groupId)!;
        const list = lists[listName];

        if (list.length === 0) {
          await ctx.reply(`📋 ${listName.toUpperCase()} está vazia.\n\nUse $${listName}add <item> para adicionar.`);
        } else {
          const formatted = list.map((item, idx) => `${idx + 1}. ${item}`).join('\n');
          await ctx.reply(`📋 ${listName.toUpperCase()}:\n\n${formatted}`);
        }

      } catch (error: any) {
        console.error(`[Lists] Erro em ${listName}:`, error);
        await ctx.reply(`❌ Erro: ${error.message}`);
      }
    }
  };
}

function createListAddCommand(listName: 'lista1' | 'lista2' | 'lista3'): ICommand {
  return {
    name: `${listName}add`,
    description: `Adiciona um item na ${listName}`,

    async execute(ctx: CommandContext) {
      try {
        if (!ctx.isGroup) {
          await ctx.reply('❌ Este comando só funciona em grupos.');
          return;
        }

        if (ctx.args.length === 0) {
          await ctx.reply(`❌ Use: $${listName}add <item>`);
          return;
        }

        const groupId = ctx.chatId;
        initGroupLists(groupId);
        const lists = groupLists.get(groupId)!;

        const item = ctx.args.join(' ');
        lists[listName].push(item);
        saveLists();

        await ctx.reply(`✅ Item adicionado à ${listName.toUpperCase()}!\n\n"${item}"`);

      } catch (error: any) {
        console.error(`[Lists] Erro em ${listName}add:`, error);
        await ctx.reply(`❌ Erro: ${error.message}`);
      }
    }
  };
}

function createListDelCommand(listName: 'lista1' | 'lista2' | 'lista3'): ICommand {
  return {
    name: `${listName}del`,
    description: `Apaga toda a ${listName}`,

    async execute(ctx: CommandContext) {
      try {
        if (!ctx.isGroup) {
          await ctx.reply('❌ Este comando só funciona em grupos.');
          return;
        }

        // Verificação robusta de admin (igual ao comando $ban)
        const hasPermission = await checkAdminPermission(ctx);
        if (!hasPermission) {
          await ctx.reply('❌ Apenas administradores podem apagar listas.');
          return;
        }

        const groupId = ctx.chatId;
        initGroupLists(groupId);
        const lists = groupLists.get(groupId)!;

        const itemCount = lists[listName].length;
        lists[listName] = [];
        saveLists();

        await ctx.reply(`🗑️ ${listName.toUpperCase()} apagada! (${itemCount} itens removidos)`);

      } catch (error: any) {
        console.error(`[Lists] Erro em ${listName}del:`, error);
        await ctx.reply(`❌ Erro: ${error.message}`);
      }
    }
  };
}

function createListEditCommand(listName: 'lista1' | 'lista2' | 'lista3'): ICommand {
  return {
    name: `${listName}edit`,
    description: `Edita toda a ${listName} (substitui completamente)`,

    async execute(ctx: CommandContext) {
      try {
        if (!ctx.isGroup) {
          await ctx.reply('❌ Este comando só funciona em grupos.');
          return;
        }

        // Verificação robusta de admin (igual ao comando $ban)
        const hasPermission = await checkAdminPermission(ctx);
        if (!hasPermission) {
          await ctx.reply('❌ Apenas administradores podem editar listas.');
          return;
        }

        if (ctx.args.length === 0) {
          await ctx.reply(
            `❌ Use: $${listName}edit <item1> | <item2> | <item3>\n\n` +
            `Exemplo: $${listName}edit Comprar pão | Estudar | Fazer exercício`
          );
          return;
        }

        const groupId = ctx.chatId;
        initGroupLists(groupId);
        const lists = groupLists.get(groupId)!;

        // Split por | ou quebra de linha
        const fullText = ctx.args.join(' ');
        const items = fullText.split(/\s*\|\s*|\n/).filter(item => item.trim());

        lists[listName] = items;
        saveLists();

        const formatted = items.map((item, idx) => `${idx + 1}. ${item}`).join('\n');
        await ctx.reply(
          `✅ ${listName.toUpperCase()} atualizada!\n\n` +
          `📋 Nova lista:\n${formatted}`
        );

      } catch (error: any) {
        console.error(`[Lists] Erro em ${listName}edit:`, error);
        await ctx.reply(`❌ Erro: ${error.message}`);
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
