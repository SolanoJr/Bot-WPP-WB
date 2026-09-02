/**
 * 🔒 WarriorBlack - Platform Manager
 *
 * Orquestrador singleton para gerenciar múltiplas plataformas (WhatsApp, Telegram, Discord)
 */

import {
  PlatformType,
  PlatformAdapter,
  PlatformClient,
  PlatformMessage,
  PlatformChat,
  PlatformUser,
  CommandContext,
  ICommand,
  SendOptions,
  MediaPayload,
  MessageHandler
} from './base/PlatformTypes';
import { rateLimiter } from '../services/rateLimiter';
import metricsService from '../services/metricsService';
import { isMaster } from '../services/permissions';
import logger, { logError, logWarning } from '../services/loggerService';

type AdapterFactory = () => Promise<PlatformAdapter>;

export class PlatformManager {
  private static instance: PlatformManager;
  private adapters = new Map<PlatformType, PlatformAdapter>();
  private messageHandlers: MessageHandler[] = [];
  private readyHandlers: Array<() => void> = [];
  private disconnectedHandlers: Array<(platform: PlatformType, reason: string) => void> = [];
  private commandRegistry = new Map<string, ICommand>();
  private initialized = false;
  // Rastreia o último chatId visto em cada plataforma (para comandos de ponte como $send)
  private lastChatByPlatform = new Map<PlatformType, string>();

  private constructor() {}

  static getInstance(): PlatformManager {
    if (!PlatformManager.instance) {
      PlatformManager.instance = new PlatformManager();
    }
    return PlatformManager.instance;
  }

  /**
   * Registra um adapter de plataforma
   */
  registerAdapter(adapter: PlatformAdapter): void {
    if (this.adapters.has(adapter.platform)) {
      logWarning(`[PlatformManager] Adapter para ${adapter.platform} já registrado, substituindo...`);
    }
    this.adapters.set(adapter.platform, adapter);
    logger.info(`[PlatformManager] Adapter registrado: ${adapter.platform}`);
    
    // NOTA: Os handlers são configurados internamente pelo adapter
    // Não precisamos conectar aqui pois o adapter já implementa PlatformClient
    // e configura seus próprios handlers no setupEventHandlers
  }

  /**
   * Registra factory para inicialização lazy
   */
  registerAdapterFactory(platform: PlatformType, factory: AdapterFactory): void {
    // Armazenar para inicialização posterior
    (this as any)[`_factory_${platform}`] = factory;
  }

  /**
   * Inicializa todas as plataformas registradas
   */
  async startAll(): Promise<void> {
    if (this.initialized) {
      logWarning('[PlatformManager] Já inicializado');
      return;
    }

    logger.info('[PlatformManager] Iniciando todas as plataformas...');

    // Inicializar em PARALELO (allSettled) para que uma plataforma lenta/travada
    // (ex: Telegram launch() aguardando ready) não bloqueie as demais (Discord/WPP).
    const results = await Promise.allSettled(
      Array.from(this.adapters.entries()).map(async ([platform, adapter]) => {
        try {
          logger.info(`[PlatformManager] Inicializando ${platform}...`);
          await adapter.initialize();
          this.setupAdapterHandlers(adapter);
          logger.info(`[PlatformManager] ✅ ${platform} pronto`);
        } catch (error) {
          logError(`StartAll:${platform}`, error);
          // Continua com as outras plataformas
        }
      })
    );

    // Log de resumo de falhas (se houver)
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        logError(`StartAll:platforma_${i}`, r.reason);
      }
    });

    this.initialized = true;
    logger.info('[PlatformManager] Todas as plataformas inicializadas');
  }

  /**
   * Configura handlers de mensagem para um adapter
   */
  private setupAdapterHandlers(adapter: PlatformAdapter): void {
    const client = adapter.client;

    client.onMessage(async (rawMessage: PlatformMessage) => {
      const startTs = Date.now();
      // Normalizar e enriquecer mensagem
      const message = this.enrichMessage(rawMessage, adapter.platform);

      // Telemetria: mensagem recebida
      metricsService.incrementMessage(adapter.platform);

      // Rastrear último chat visto nesta plataforma (para ponte $send)
      this.lastChatByPlatform.set(adapter.platform, message.chatId);

      // Verificar se é comando
      const prefix = this.getCommandPrefix(adapter.platform);
      const trimmedText = message.text.trim();
      message.isCommand = trimmedText.startsWith(prefix);
      if (message.isCommand) {
        const parts = trimmedText.slice(prefix.length).trim().split(/ +/);
        message.commandName = (parts.shift() || '').toLowerCase();
        message.args = parts;
      }

      // Executar handlers globais (logging, etc)
      for (const handler of this.messageHandlers) {
        try {
          await handler(message);
        } catch (error) {
          logError('MessageHandler', error);
        }
      }

      // Se é comando, executar
      if (message.isCommand && message.commandName) {
        await this.executeCommand(message, adapter);
        // Reagir com 👍 na mensagem de comando (feedback visual)
        try {
          if (message.raw && typeof message.raw.react === 'function') {
            await message.raw.react('👍');
          } else if (typeof adapter.client.react === 'function') {
            await adapter.client.react(message.id, '👍');
          }
        } catch (reactErr: any) {
          logWarning(`[REACT] erro ao reagir com 👍: ${reactErr?.message}`);
        }
      }

      // Telemetria: duração do processamento
      metricsService.recordMessageProcessingDuration(adapter.platform, Date.now() - startTs);
    });

    client.onReady(() => {
      // Telemetria: conexão de plataforma
      metricsService.recordPlatformConnection(adapter.platform);
      logger.info(`[PlatformManager] ${adapter.platform} conectado e pronto`);
      for (const handler of this.readyHandlers) {
        try {
          handler();
        } catch (error) {
          logError('ReadyHandler', error);
        }
      }
    });

    client.onDisconnected((reason: string) => {
      // Telemetria: desconexão de plataforma
      metricsService.recordPlatformDisconnection(adapter.platform);
      logger.info(`[PlatformManager] ${adapter.platform} desconectado: ${reason}`);
      for (const handler of this.disconnectedHandlers) {
        try {
          handler(adapter.platform, reason);
        } catch (error) {
          logError('DisconnectedHandler', error);
        }
      }
    });
  }

  /**
   * Enriquece mensagem com metadados da plataforma
   */
  private enrichMessage(message: PlatformMessage, platform: PlatformType): PlatformMessage {
    return {
      ...message,
      platform,
      // Garantir IDs com prefixo para evitar conflitos
      chatId: this.normalizeChatId(message.chatId, platform),
      userId: this.normalizeUserId(message.userId, platform),
    };
  }

  /**
   * Normaliza chat ID com prefixo da plataforma
   */
  private normalizeChatId(chatId: string, platform: PlatformType): string {
    const prefix = platform.startsWith('whatsapp') ? 'wpp:' : platform === 'telegram' ? 'tg:' : 'dc:';
    return chatId.startsWith(prefix) ? chatId : `${prefix}${chatId}`;
  }

  /**
   * Normaliza user ID com prefixo da plataforma
   */
  private normalizeUserId(userId: string, platform: PlatformType): string {
    const prefix = platform.startsWith('whatsapp') ? 'wpp:' : platform === 'telegram' ? 'tg:' : 'dc:';
    return userId.startsWith(prefix) ? userId : `${prefix}${userId}`;
  }

  /**
   * Obtém prefixo de comando por plataforma
   * TODOS usam $ para consistência
   */
  private getCommandPrefix(platform: PlatformType): string {
    return '$'; // Todos usam o mesmo prefixo
  }

  /**
   * Processa mensagem recebida de qualquer plataforma
   */
  private async handleIncomingMessage(message: PlatformMessage): Promise<void> {
    // Ignorar mensagens do próprio bot
    if (message.isFromMe) return;
    
    // Verificar se é comando (começa com $)
    const PREFIX = '$';
    if (!message.text || !message.text.trim().startsWith(PREFIX)) return;
    
    // Parsear comando e argumentos
    const parts = message.text.slice(PREFIX.length).trim().split(/\s+/);
    const commandName = parts[0].toLowerCase();
    const args = parts.slice(1);
    
    // Atualizar mensagem com info do comando
    message.isCommand = true;
    message.commandName = commandName;
    message.args = args;
    
    logger.info(`[PlatformManager] Comando recebido: ${commandName} de ${message.userName} (${message.platform})`);
    
    // Buscar adapter da plataforma
    const adapter = this.adapters.get(message.platform);
    if (!adapter) {
      logger.error(`[PlatformManager] Adapter não encontrado para ${message.platform}`);
      return;
    }
    
    // Executar comando
    await this.executeCommand(message, adapter);
  }

  /**
   * Executa comando se encontrado
   */
  private async executeCommand(message: PlatformMessage, adapter: PlatformAdapter): Promise<void> {
    const command = this.commandRegistry.get(message.commandName!);

    if (!command) {
      // Comando não encontrado - poderia buscar no relay (futuro)
      logger.info(`[PlatformManager] Comando não encontrado: ${message.commandName} em ${adapter.platform}`);
      return;
    }

    // Verificar se comando está disponível nesta plataforma
    if (command.platforms && !command.platforms.includes(adapter.platform)) {
      await adapter.client.sendMessage(message.chatId, `⚠️ Comando \`${message.commandName}\` não disponível no ${adapter.platform}.`);
      return;
    }

    // Verificar permissões
    const hasPermission = await this.checkPermissions(message, command);
    if (!hasPermission) {
      return; // Resposta de erro já enviada no checkPermissions
    }

    // Rate limiting por usuário (20 comandos/minuto)
    const rate = rateLimiter.checkLimit(message.userId);
    if (rate.limitExceeded) {
      metricsService.incrementRateLimitHit();
      const waitSec = Math.ceil((rate.resetTime - Date.now()) / 1000);
      await adapter.client.sendMessage(
        message.chatId,
        `⏳ Você excedeu o limite de comandos. Aguarde ~${waitSec}s antes de usar outro comando.`
      );
      return;
    }

    // Criar contexto unificado
    const ctx = await this.createCommandContext(message, adapter.client);

    try {
      logger.info(`[PlatformManager] Executando ${message.commandName} em ${adapter.platform} para ${message.userName}`);

      // Registrar métricas e uso
      metricsService.incrementCommand(message.commandName!, adapter.platform);
      await this.logCommandUsage(message.commandName!, message.userId, message.chatId);

      await command.execute(ctx);
    } catch (error: any) {
      logError(`Command:${message.commandName}`, error);
      await ctx.reply('⚠️ Ocorreu um erro interno ao executar este comando.');
    }
  }

  /**
   * Registra uso de comando no banco de dados
   */
  private async logCommandUsage(commandName: string, userId: string, groupId: string): Promise<void> {
    try {
      // Importar dinamicamente para evitar dependência circular
      const { getDb } = await import('../services/databaseService.js');
      const db = await getDb();
      
      // Limpar prefixos de plataforma dos IDs
      const cleanUserId = userId.replace(/^(wpp:|tg:|dc:)/, '');
      const cleanGroupId = groupId.replace(/^(wpp:|tg:|dc:)/, '');
      
      await db.run(
        'INSERT INTO command_logs (command_name, user_id, group_id) VALUES (?, ?, ?)',
        [commandName, cleanUserId, cleanGroupId]
      );
    } catch (error) {
      // Não falhar o comando se logging falhar
      logError('LogCommandUsage', error);
    }
  }

  /**
   * Verifica permissões do usuário para o comando
   */
  private async checkPermissions(message: PlatformMessage, command: ICommand): Promise<boolean> {
    // Por enquanto, apenas comandos que precisam de MASTER/ADMIN
    // A lógica real estará no requirePermission do comando
    return true;
  }

  /**
   * Cria CommandContext unificado
   */
  private async createCommandContext(message: PlatformMessage, client: PlatformClient): Promise<CommandContext> {
    let groupName: string | undefined;
    let contextIsAdmin = false;
    try {
      const chat = await client.getChat(message.chatId);
      groupName = (chat as any)?.name;
      // Admin do grupo: verifica se o userId está em participants com isAdmin/isSuperAdmin
      const cleanUser = String(message.userId).split('@')[0].replace(/^wpp:/, '');
      const parts = (chat as any)?.participants || [];
      const isGroupAdmin = parts.some((p: any) => {
        const pid = String(p.id?._serialized || p.id || '').split('@')[0].replace(/^wpp:/, '');
        return pid === cleanUser && (p.isAdmin || p.isSuperAdmin);
      });
      contextIsAdmin = isGroupAdmin;
    } catch { /* ignora */ }
    return {
      msg: message,
      client,
      args: message.args || [],
      platform: message.platform,
      chatId: message.chatId,
      userId: message.userId,
      userName: message.userName,
      groupName,
      isGroup: message.raw?.isGroup || false,
      isMaster: isMaster(message.userId),
      isAdmin: contextIsAdmin,
      reply: async (text: string, options?: SendOptions) => {
        // Telemetria: mensagem enviada
        metricsService.recordMessageSent(message.platform);
        // Responde citando (quote) a mensagem original do comando.
        // Fallback: se o quote falhar (ex: ID inválido em ambiente de teste),
        // reenvia sem quote para não quebrar o comando.
        try {
          await client.sendMessage(message.chatId, text, {
            ...options,
            replyToMessageId: message.id,
          });
        } catch (quoteErr: any) {
          logWarning(`[reply] quote falhou, reenviando sem quote: ${quoteErr?.message}`);
          await client.sendMessage(message.chatId, text, options);
        }
      },
      replyPrivate: async (text: string) => {
        // Para WhatsApp, envia no privado do usuário
        // Para Telegram/Discord, envia DM
        await client.sendMessage(message.userId, text);
      },
      getChat: () => client.getChat(message.chatId),
      getUser: () => client.getUser(message.userId),
    };
  }

  /**
   * Registra comando global (disponível em todas plataformas)
   */
  registerCommand(command: ICommand): void {
    this.commandRegistry.set(command.name, command);
    logger.info(`[PlatformManager] Comando registrado: ${command.name}${command.platforms ? ` (${command.platforms.join(', ')})` : ' (todas)'}`);
  }

  /**
   * Carrega múltiplos comandos de uma vez
   */
  loadCommands(commands: Map<string, ICommand>): void {
    for (const [name, command] of commands) {
      this.registerCommand(command);
    }
  }

  /**
   * Envia mensagem para uma plataforma específica
   */
  async sendMessage(platform: PlatformType, chatId: string, text: string, options?: SendOptions): Promise<void> {
    const adapter = this.adapters.get(platform);
    if (!adapter) {
      throw new Error(`Plataforma ${platform} não inicializada`);
    }
    await adapter.client.sendMessage(chatId, text, options);
  }

  /**
   * Envia mensagem para TODAS as plataformas (broadcast)
   */
  async broadcast(text: string, options?: SendOptions): Promise<void> {
    for (const [platform, adapter] of this.adapters) {
      try {
        // Buscar chats ativos dessa plataforma
        const chats = await adapter.client.getChats();
        for (const chat of chats) {
          if (chat.isGroup) { // Apenas grupos para broadcast
            await adapter.client.sendMessage(chat.id, text, options);
          }
        }
      } catch (error) {
        logError(`Broadcast:${platform}`, error);
      }
    }
  }

  /**
   * Obtém cliente de uma plataforma
   */
  getClient(platform: PlatformType): PlatformClient | undefined {
    return this.adapters.get(platform)?.client;
  }

  /**
   * Retorna o adapter registrado de uma plataforma (ou por prefixo, ex: "whatsapp").
   * Substitui o acesso direto a `this.adapters` (privado) por uma API estável.
   */
  getAdapter(platform: PlatformType): PlatformAdapter | undefined {
    let adapter = this.adapters.get(platform);
    if (!adapter) {
      for (const [key, value] of this.adapters) {
        if (key.startsWith(platform)) {
          adapter = value;
          break;
        }
      }
    }
    return adapter;
  }

  /**
   * Verifica se plataforma está pronta
   */
  isReady(platform: PlatformType): boolean {
    return this.adapters.get(platform)?.client.isReady || false;
  }

  /**
   * Registra handler global de mensagens
   */
  onMessage(handler: MessageHandler): void {
    this.messageHandlers.push(handler);
  }

  /**
   * Registra handler de pronto
   */
  onReady(handler: () => void): void {
    this.readyHandlers.push(handler);
  }

  /**
   * Registra handler de desconexão
   */
  onDisconnected(handler: (platform: PlatformType, reason: string) => void): void {
    this.disconnectedHandlers.push(handler);
  }

  /**
   * Desliga todas as plataformas
   */
  async shutdownAll(): Promise<void> {
    logger.info('[PlatformManager] Desligando todas as plataformas...');
    for (const [platform, adapter] of this.adapters) {
      try {
        await adapter.shutdown();
        logger.info(`[PlatformManager] ✅ ${platform} desligado`);
      } catch (error) {
        logError(`Shutdown:${platform}`, error);
      }
    }
    this.initialized = false;
  }

  /** Para compatibilidade com multiPlatform.ts — delega para shutdownAll() */
  async shutdown(): Promise<void> {
    return this.shutdownAll();
  }

  /**
   * Lista plataformas ativas
   */
  getActivePlatforms(): PlatformType[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * Executa um comando de teste diretamente (sem depender de mensagens externas)
   * Útil para testes automatizados e para contornar limitações de bots não receberem suas próprias mensagens
   */
  async executeTestCommand(platform: string, command: string): Promise<any> {
    // Buscar adapter (suporta prefixos como whatsapp:558581344211)
    let adapter = this.adapters.get(platform);
    if (!adapter) {
      // Buscar por prefixo
      for (const [key, value] of this.adapters) {
        if (key.startsWith(platform)) {
          adapter = value;
          break;
        }
      }
    }
    if (!adapter) {
      throw new Error(`Plataforma não encontrada: ${platform}`);
    }

    // Criar uma PlatformMessage de teste
    const testMessage: PlatformMessage = {
      id: `test-${Date.now()}`,
      platform,
      chatId: platform === 'whatsapp' || platform.startsWith('whatsapp:')
        ? (process.env.WPP_TEST_CHAT_ID || '558581344211@c.us')
        : platform === 'telegram' ? 'tg:146078742' : 'dc:1521942390082900190',
      userId: platform === 'whatsapp' || platform.startsWith('whatsapp:')
        ? (process.env.WPP_TEST_USER_ID || '558581344211@c.us')
        : platform === 'telegram' ? 'tg:146078742' : 'dc:1307158493907652648',
      userName: 'TestUser',
      text: command,
      timestamp: new Date(),
      isFromMe: false,
      isCommand: true,
      commandName: command.replace('$', '').split(' ')[0],
      args: command.split(' ').slice(1),
      raw: {},
      hasMedia: false,
    };

    console.log(`[TestCommand] Executando ${command} em ${platform}`);

    // Enviar diretamente para o handleIncomingMessage
    await this.handleIncomingMessage(testMessage);

    return { success: true, command, platform };
  }

  /**
   * Obtém registry de comandos
   */
  getCommandRegistry(): Map<string, ICommand> {
    return this.commandRegistry;
  }

  /**
   * Retorna o último chatId visto em uma plataforma (para comandos de ponte entre plataformas)
   */
  getLastChat(platform: PlatformType): string | undefined {
    return this.lastChatByPlatform.get(platform);
  }
}

export const platformManager = PlatformManager.getInstance();