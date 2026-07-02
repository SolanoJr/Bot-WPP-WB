import { ICommand } from './types';
import fs from 'fs';
import path from 'path';

// Armazena mensagens de boas-vindas personalizadas por grupo
const welcomeMessages: Map<string, string> = new Map();
const WELCOME_FILE = path.join(process.cwd(), 'data', 'welcome-messages.json');

// Carrega mensagens salvas
function loadWelcomeMessages() {
  try {
    if (fs.existsSync(WELCOME_FILE)) {
      const data = fs.readFileSync(WELCOME_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      Object.keys(parsed).forEach(key => {
        welcomeMessages.set(key, parsed[key]);
      });
    }
  } catch (error) {
    console.error('[Welcome] Erro ao carregar mensagens:', error);
  }
}

// Salva mensagens
function saveWelcomeMessages() {
  try {
    const dataDir = path.dirname(WELCOME_FILE);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const obj: any = {};
    welcomeMessages.forEach((value, key) => {
      obj[key] = value;
    });
    fs.writeFileSync(WELCOME_FILE, JSON.stringify(obj, null, 2));
  } catch (error) {
    console.error('[Welcome] Erro ao salvar mensagens:', error);
  }
}

// Carrega ao iniciar
loadWelcomeMessages();

export const welcomeCommand: ICommand = {
  name: 'bemvindo',
  description: 'Define mensagem de boas-vindas personalizada para o grupo',
  
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
        await msg.reply('❌ Apenas administradores podem configurar a mensagem de boas-vindas.');
        return;
      }

      // Se não tem argumentos, mostra a mensagem atual
      if (args.length === 0) {
        const currentMsg = welcomeMessages.get(chat.id._serialized) || 'Padrão: Bem-vindo(a) ao grupo!';
        await msg.reply(
          `📝 Mensagem de boas-vindas atual:\n\n` +
          `"${currentMsg}"\n\n` +
          `💡 Para alterar, use: $bemvindo <sua mensagem>`
        );
        return;
      }

      // Define nova mensagem
      const newMessage = args.join(' ');
      welcomeMessages.set(chat.id._serialized, newMessage);
      saveWelcomeMessages();

      await msg.reply(
        `✅ Mensagem de boas-vindas configurada!\n\n` +
        `Preview:\n` +
        `"Bem-vindo(a) @novato\n${newMessage}"`
      );

    } catch (error: any) {
      console.error('[Welcome] Erro:', error);
      await msg.reply(`❌ Erro: ${error.message}`);
    }
  }
};

/**
 * Retorna a mensagem de boas-vindas para um grupo
 */
export function getWelcomeMessage(groupId: string): string {
  return welcomeMessages.get(groupId) || '';
}
