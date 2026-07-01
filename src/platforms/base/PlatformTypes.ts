/**
 * 🔒 WarriorBlack - Tipos Base Multi-Plataforma
 *
 * Interfaces agnósticas de plataforma para unificar WhatsApp, Telegram e Discord
 */

export type PlatformType = 'whatsapp' | 'telegram' | 'discord';

export interface PlatformUser {
  id: string;                    // ID único na plataforma (ex: "5511999999999@c.us" | "123456789" | "123456789012345678")
  name: string;                  // Nome de exibição
  username?: string;             // Username/handle se houver
  isBot: boolean;
  platform: PlatformType;
  raw: any;                      // Objeto original da plataforma
}

export interface PlatformChat {
  id: string;                    // ID único do chat/grupo (ex: "5511999999999-123456@g.us" | "-1001234567890" | "123456789012345678")
  name: string;                  // Nome do grupo ou "Chat Privado"
  isGroup: boolean;
  platform: PlatformType;
  participants?: PlatformUser[]; // Para grupos
  raw: any;
}

export interface PlatformMessage {
  id: string;                    // ID único da mensagem
  chatId: string;                // ID do chat onde foi enviada
  userId: string;                // ID do autor
  userName: string;              // Nome do autor
  text: string;                  // Conteúdo textual
  timestamp: Date;               // Quando foi enviada
  isFromMe: boolean;             // Se o bot enviou
  isCommand: boolean;            // Se começa com prefixo de comando
  commandName?: string;          // Nome do comando (sem prefixo)
  args?: string[];               // Argumentos parseados
  platform: PlatformType;
  raw: any;                      // Objeto original da plataforma
  // Metadados opcionais
  replyToMessageId?: string;     // ID da mensagem respondida
  mentions?: PlatformUser[];     // Usuários mencionados
  hasMedia: boolean;
  mediaType?: 'image' | 'video' | 'audio' | 'document' | 'sticker' | 'location' | 'contact';
}

export interface PlatformClient {
  platform: PlatformType;
  userId: string;                // ID do bot na plataforma
  userName: string;              // Nome do bot
  isReady: boolean;
  // Métodos principais
  sendMessage(chatId: string, text: string, options?: SendOptions): Promise<PlatformMessage>;
  sendMedia(chatId: string, media: MediaPayload, caption?: string): Promise<PlatformMessage>;
  getChat(chatId: string): Promise<PlatformChat>;
  getUser(userId: string): Promise<PlatformUser>;
  getChats(): Promise<PlatformChat[]>;
  onMessage(handler: MessageHandler): void;
  onReady(handler: () => void): void;
  onDisconnected(handler: (reason: string) => void): void;
  shutdown(): Promise<void>;
}

export type MessageHandler = (message: PlatformMessage) => Promise<void>;

export interface SendOptions {
  replyToMessageId?: string;
  parseMode?: 'markdown' | 'html' | 'none';
  disablePreview?: boolean;
  buttons?: ButtonOptions[];
}

export interface ButtonOptions {
  text: string;
  callbackData?: string;
  url?: string;
}

export interface MediaPayload {
  type: 'image' | 'video' | 'audio' | 'document' | 'sticker';
  data: Buffer | string;         // Buffer ou path/URL
  filename?: string;
  mimetype?: string;
}

export interface PlatformAdapter {
  readonly platform: PlatformType;
  readonly client: PlatformClient;
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
}

export interface CommandContext {
  msg: PlatformMessage;
  client: PlatformClient;
  args: string[];
  platform: PlatformType;
  chatId: string;
  userId: string;
  userName: string;
  isGroup: boolean;
  isMaster: boolean;
  isAdmin: boolean;
  reply(text: string, options?: SendOptions): Promise<void>;
  replyPrivate(text: string): Promise<void>;
  getChat(): Promise<PlatformChat>;
  getUser(): Promise<PlatformUser>;
}

export interface ICommand {
  name: string;
  description: string;
  platforms?: PlatformType[];    // Se undefined, disponível em todas
  execute(ctx: CommandContext): Promise<void> | void;
}