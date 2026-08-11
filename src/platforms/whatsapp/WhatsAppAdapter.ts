/**
 * 🔒 WarriorBlack - WhatsApp Adapter
 *
 * Wrapper do whatsapp-web.js existente para a interface PlatformAdapter
 */

import { Client, Message, Chat, Contact, LocalAuth } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import fs from 'fs';
import path from 'path';
import {
  PlatformType,
  PlatformAdapter,
  PlatformClient,
  PlatformMessage,
  PlatformChat,
  PlatformUser,
  SendOptions,
  MediaPayload,
  MessageHandler
} from './base/PlatformTypes';
import { platformManager } from '../PlatformManager';
import { processAutoMod } from '../../services/autoModService';
import { handleKeywords } from '../../services/keywordHandler';

export class WhatsAppAdapter implements PlatformAdapter, PlatformClient {
  readonly platform: PlatformType = 'whatsapp';
  readonly client: PlatformClient;
  private innerClient: Client;
  private messageHandler: MessageHandler | null = null;
  private readyHandler: (() => void) | null = null;
  private disconnectedHandler: ((reason: string) => void) | null = null;
  private isManuallyDestroyed = false;
  private _processedMsgIds = new Set<string>();
  public userId = '';
  public userName = '';
  public isReady = false;

  constructor() {
    this.client = this;

    // Encerramento limpo (graceful shutdown)
    const shutdown = (signal: string) => {
      console.log(`[WhatsAppAdapter] Recebido ${signal} - encerrando cliente (client.destroy)...`);
      try {
        this.innerClient.destroy();
      } catch (err: any) {
        console.error(`[WhatsAppAdapter] Erro em client.destroy():`, err?.message);
      }
      this.isManuallyDestroyed = true;
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    // Cria o client + handlers (pode ser chamado de novo no disconnected p/ reconexao limpa)
    this.connect();
  }

  /**
   * Cria um Client WWebJS fresco e registra TODOS os handlers. Chamado no
   * construtor e novamente a cada 'disconnected' (reconexao limpa). Isso garante
   * que o on('message') SEMPRE exista no client ativo — corrige o WPP mudo apos
   * reconexoes internas do WhatsApp Web que matavam os handlers do client velho.
   */
  private connect(): void {
    const authPath = path.join(process.cwd(), process.env.WWEBJS_AUTH_DIR || '.wwebjs_auth');
    if (!fs.existsSync(authPath)) {
      fs.mkdirSync(authPath, { recursive: true });
    }

    const puppeteerConfig: any = {
      headless: true,
      timeout: 120000,
      protocolTimeout: 180000,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--disable-gpu',
        '--disable-extensions'
      ]
    };

    // Destroi client anterior (se houver) antes de criar o novo
    try {
      this.innerClient?.destroy?.();
    } catch { /* ignora */ }

    this.innerClient = new Client({
      authStrategy: new LocalAuth({ dataPath: authPath }),
      puppeteer: puppeteerConfig
    });

    this.setupEventHandlers();
    this.registerMessageHandlers();
    this.innerClient.initialize();
  }


  private setupEventHandlers(): void {
    this.innerClient.on('qr', (qr: string) => {
      console.log('[WhatsApp] 🔑 QR Code recebido — ESCANEIE com seu WhatsApp (App > Dispositivos conectados):');
      qrcode.generate(qr, { small: true });
      console.log('[WhatsApp] (Se não precisar escanear, a sessão foi restaurada do cache LocalAuth.)');
    });

    this.innerClient.on('authenticated', () => {
      console.log('[WhatsApp] 🔓 Sessão autenticada com sucesso (LocalAuth restaurado ou novo login).');
    });

    this.innerClient.on('auth_failure', (msg: string) => {
      console.error(`[WhatsApp] ❌ Falha de autenticação: ${msg}`);
      console.error('[WhatsApp] A sessão pode estar inválida; pode ser necessário limpar .wwebjs_auth e reescaneear o QR.');
    });

    this.innerClient.on('change_state', (state: string) => {
      console.log(`[WhatsApp] 🔄 Mudança de estado da conexão: ${state}`);
      // WWebJS reconecta internamente via change_state sem repetir 'ready';
      // re-registra handlers de mensagem para nao ficar mudo apos reconexao.
      if (state === 'CONNECTED') {
        this.registerMessageHandlers();
      }
    });

    // Diagnostico WPP mudo: logar QUALQUER evento que o WhatsApp empurre
    this.innerClient.on('message_ack', (m: any, a: any) => console.log(`[DIAG] message_ack disparou - from: ${m?.from} ack: ${a}`));
    this.innerClient.on('incoming_call', (c: any) => console.log(`[DIAG] incoming_call disparou - ${c?.from}`));
    this.innerClient.on('message_revoke_everyone', () => console.log(`[DIAG] message_revoke_everyone disparou`));
    this.innerClient.on('group_update', () => console.log(`[DIAG] group_update disparou`));

    this.innerClient.on('ready', () => {
      this.isReady = true;
      this.userId = this.innerClient.info?.wid._serialized || '';
      this.userName = this.innerClient.info?.pushname || 'Bot-WPP';
      console.log(`[WhatsApp] ✅ Pronto como ${this.userName} (${this.userId})`);
      
      // O AutoMod agora é processado via messageHandler.ts para maior controle
      console.log('[WhatsApp] 🛡️ Sistema de AutoMod (via Handler) pronto');
      
      // (Re)Registra handlers de mensagem em CADA reconexão (corrige WPP mudo
      // após reconexão do WhatsApp Web, quando o client interno é recriado).
      this.registerMessageHandlers();

      // Prova de ENVIO: ao ficar pronto, manda msg de "online" pro num do dono
      // e pro grupo "teste". So consideramos WPP online apos ambas chegarem.
      const alvoDono = '558581344211@c.us';
      const alvoTeste = process.env.WPP_TEST_GROUP_ID || '';
      const msgOnline = '🤖 WPP online (WarriorBlack). Conexão restabelecida e enviando esta mensagem como prova de funcionamento.';
      this.sendMessage(alvoDono, msgOnline)
        .then(() => console.log('[WhatsApp] ✅ Mensagem de prova ENVIADA para', alvoDono))
        .catch((e: any) => console.error('[WhatsApp] ❌ Falha ao enviar msg de prova para dono:', e?.message));
      if (alvoTeste) {
        this.sendMessage(alvoTeste, msgOnline)
          .then(() => console.log('[WhatsApp] ✅ Mensagem de prova ENVIADA para grupo teste', alvoTeste))
          .catch((e: any) => console.error('[WhatsApp] ❌ Falha ao enviar msg de prova para grupo teste:', e?.message));
      } else {
        console.log('[WhatsApp] ⚠️ WPP_TEST_GROUP_ID nao definido - pulando msg de prova no grupo teste');
      }
      
      // SELF-TEST do $kick (apenas se WPP_KICK_SELFTEST=1). O bot envia um
      // $kick @<nao-admin> no grupo teste; o message_create (sem filtro fromMe)
      // processa e testa o fluxo real do comando.
      if (process.env.WPP_KICK_SELFTEST === '1' && alvoTeste) {
        setTimeout(async () => {
          try {
            const grp = await this.innerClient.getChatById(alvoTeste);
            const me = this.innerClient.info.wid._serialized;
            const target = (grp.participants || []).find(p => (p.id._serialized||p.id) !== me && !p.isAdmin && !p.isSuperAdmin);
            if (target) {
              const tid = target.id._serialized || target.id;
              console.log('[SELFTEST] enviando $kick para', tid);
              await this.innerClient.sendMessage(alvoTeste, '$kick @' + tid.split('@')[0], { mentions: [tid] });
            } else {
              console.log('[SELFTEST] nenhum nao-admin para kick');
            }
          } catch (e: any) {
            console.error('[SELFTEST] erro:', e?.message);
          }
        }, 3000);
      }
      
      if (this.readyHandler) this.readyHandler();
    });

    this.innerClient.on('disconnected', (reason: string) => {
      this.isReady = false;
      console.log(`[WhatsApp] 🔌 Desconectado: ${reason}`);
      if (this.disconnectedHandler) this.disconnectedHandler(reason);
      // Aviso de OFFLINE pro dono e grupo teste (ele pediu para saber qndo cai)
      const msgOffline = `🔴 WPP OFFLINE (WarriorBlack). Motivo: ${reason}. Reconectando...`;
      this.sendMessage('558581344211@c.us', msgOffline).catch(() => {});
      const grpTeste = process.env.WPP_TEST_GROUP_ID;
      if (grpTeste) this.sendMessage(grpTeste, msgOffline).catch(() => {});
      // Reconexao limpa: recria o Client com handlers frescos (corrige WPP mudo).
      // So pula se foi encerramento manual (SIGINT/SIGTERM).
      if (!this.isManuallyDestroyed) {
        console.log(`[WhatsApp] ♻️ Reconectando (nova instancia de Client)...`);
        setTimeout(() => this.connect(), 3000);
      }
    });

    // Evento de entrada de novos membros no grupo
    this.innerClient.on('group_join', async (notification: any) => {
      try {
        await this.handleMemberJoin(notification);
      } catch (error) {
        console.error('[WhatsApp] Erro ao processar entrada de membro:', error);
      }
    });

    // Fallback: monitorar mudanças de participantes
    this.innerClient.on('group_update', async (notification: any) => {
      try {
        if (notification.type === 'add') {
          await this.handleMemberJoin(notification);
        }
      } catch (error) {
        console.error('[WhatsApp] Erro ao processar atualização de grupo:', error);
      }
    });
  }

  /**
   * (Re)Registra os handlers de mensagem. Chamado no 'ready' (que dispara em
   * CADA reconexão do WWebJS) para garantir que o on('message') não morra quando
   * o client interno é recriado na reconexão. O off() previo evita duplicação.
   */
  private registerMessageHandlers(): void {
    // removeAllListeners(event) nao exige listener (off(event, listener) sim, e
    // quebra com undefined). Usado para nao duplicar em multiplos 'ready'.
    this.innerClient.removeAllListeners?.('message');
    this.innerClient.removeAllListeners?.('message_create');

    this.innerClient.on('message', async (msg: Message) => {
      console.log('[WhatsAppAdapter] Mensagem recebida - msg:', !!msg, 'msg.from:', msg?.from, 'msg.author:', msg?.author);
      
      // Diagnostico: se o body vier vazio, logar o _data cru para achar o texto real
      if (!msg?.body && (msg as any)?._data) {
        const d = (msg as any)._data;
        console.log('[DIAG] msg.body vazio. type:', msg?.type, '| _data.body:', d?.body, '| _data.conversation:', d?.conversation, '| _data.data:', typeof d?.data === 'object' ? JSON.stringify(d.data).slice(0,200) : d?.data, '| _data.keys:', Object.keys(d||{}).slice(0,20).join(','));
      }
      
      // Dedup: evita processar 2x se WWebJS emitir 'message' e 'message_create' p/ mesma msg
      const mid = msg?.id?._serialized || msg?.id?.id;
      if (mid && this._processedMsgIds.has(mid)) return;
      if (mid) this._processedMsgIds.add(mid);
      
      if (!msg) {
        console.error('[WhatsAppAdapter] ERRO: msg é null/undefined, ignorando');
        return;
      }
      
      if (!msg.id) {
        console.error('[WhatsAppAdapter] ERRO: msg não tem id, ignorando - msg type:', typeof msg);
        return;
      }
      
      // Desacoplar AutoMod/handleKeywords do caminho crítico de comandos.
      void Promise.resolve().then(async () => {
        try {
          const moderated = await processAutoMod(msg, this.innerClient);
          if (moderated) {
            console.log(`🛡️ [WhatsAppAdapter] Mensagem moderada e deletada de ${msg.author || msg.from}`);
            return;
          }
          const intercepted = await handleKeywords(msg, this.innerClient);
          if (intercepted) {
            console.log(`😏 [WhatsAppAdapter] Palavra-chave detectada, resposta enviada`);
          }
        } catch (err: any) {
          console.error(`[WhatsAppAdapter] Erro em AutoMod/Keywords (nao bloqueante):`, err?.message);
        }
      });

      if (this.messageHandler) {
        try {
          const platformMsg = this.normalizeMessage(msg);
          await this.messageHandler(platformMsg);
        } catch (normError: any) {
          console.error(`[WhatsAppAdapter] Erro ao normalizar mensagem:`, normError.message);
          console.error(`[WhatsAppAdapter] Stack:`, normError.stack);
        }
      }
    });


    this.innerClient.on('message_create', async (msg: Message) => {
      if (!msg) {
        console.error('[WhatsAppAdapter] message_create: msg é null/undefined, ignorando');
        return;
      }
      
      if (!msg.id) {
        console.error('[WhatsAppAdapter] message_create: msg não tem id, ignorando');
        return;
      }
      
      // Dedup: evita processar 2x se WWebJS emitir 'message' e 'message_create' p/ mesma msg
      const mid = msg?.id?._serialized || msg?.id?.id;
      if (mid && this._processedMsgIds.has(mid)) return;
      if (mid) this._processedMsgIds.add(mid);
      
      if (this.messageHandler) {
        try {
          const platformMsg = this.normalizeMessage(msg);
          await this.messageHandler(platformMsg);
        } catch (normError: any) {
          console.error(`[WhatsAppAdapter] Erro ao normalizar message_create:`, normError.message);
        }
      }
    });
  }

  private async handleMemberJoin(notification: any): Promise<void> {
    try {
      console.log('[handleMemberJoin] ENTRY - notification:', !!notification);
      const groupId = notification.chatId || notification.id.remote;
      const newMembers = notification.recipientIds || notification.recipients || [];
      
      console.log('[WhatsApp] Novo(s) membro(s) entrando:', { groupId, members: newMembers });

      // Registrar o horário de entrada de cada membro para controle de DDI no AutoMod
      try {
        console.log('[handleMemberJoin] Chamando recordMemberJoin...');
        const { recordMemberJoin } = await import('../../services/autoModService');
        for (const memberId of newMembers) {
          console.log('[handleMemberJoin] Registrando membro:', memberId);
          recordMemberJoin(groupId, memberId);
        }
      } catch (err: any) {
        console.error('[WhatsApp] Erro ao registrar entrada de membro para AutoMod:', err.message);
        console.error('[WhatsApp] Erro stack:', err.stack);
      }

      // Importar função para obter mensagem personalizada
      const { getWelcomeMessage } = await import('../../bot/commands/welcome');
      const customMessage = getWelcomeMessage(groupId);

      // Verificar histórico de membros para detectar se é retorno
      // TODO: implementar storage de histórico de membros

      for (const memberId of newMembers) {
        const isRejoining = false; // TODO: verificar no histórico
        const welcomeText = isRejoining
          ? `Bem-vindo(a) de volta @${memberId.split('@')[0]}! 🎉`
          : `Bem-vindo(a) @${memberId.split('@')[0]}! 🎉`;

        // Adicionar mensagem personalizada se configurada
        const fullMessage = customMessage 
          ? `${welcomeText}\n\n${customMessage}`
          : welcomeText;

        // Enviar mensagem de boas-vindas mencionando o usuário
        await this.innerClient.sendMessage(
          groupId,
          fullMessage,
          {
            mentions: [memberId]
          }
        );

        console.log(`[WhatsApp] Boas-vindas enviadas para ${memberId} no grupo ${groupId}`);
      }
    } catch (error) {
      console.error('[WhatsApp] Erro ao enviar boas-vindas:', error);
    }
  }

  private normalizeMessage(msg: any): PlatformMessage {
    const msgHash = Math.random().toString(36).substring(7);
    const stack = new Error().stack;
    
    // VALIDAÇÃO DEFENSIVA ANTES DE QUALQUER ACESSO
    if (!msg) {
      console.error(`[WhatsAppAdapter.normalizeMessage] ERRO CRÍTICO - msg é null/undefined! msgHash: ${msgHash}`);
      console.error('[WhatsAppAdapter.normalizeMessage] Stack trace:', stack);
      throw new Error('Mensagem undefined/null em normalizeMessage - fonte desconhecida');
    }
    
    if (!msg.id) {
      console.error(`[WhatsAppAdapter.normalizeMessage] ERRO CRÍTICO - msg não tem id! msgHash: ${msgHash}`);
      console.error('[WhatsAppAdapter.normalizeMessage] msg type:', typeof msg);
      console.error('[WhatsAppAdapter.normalizeMessage] Stack trace:', stack);
      throw new Error('Mensagem sem id em normalizeMessage');
    }
    
    if (!msg.from) {
      console.error(`[WhatsAppAdapter.normalizeMessage] ERRO CRÍTICO - msg não tem from! msgHash: ${msgHash}`);
      console.error('[WhatsAppAdapter.normalizeMessage] msg type:', typeof msg);
      console.error('[WhatsAppAdapter.normalizeMessage] Stack trace:', stack);
      throw new Error('Mensagem sem from em normalizeMessage');
    }
    
    console.log(`[WhatsAppAdapter.normalizeMessage] ENTRY - msgHash: ${msgHash}`);
    console.log(`[WhatsApp] normalizeMessage() - msg.id:`, msg?.id, 'msg.id._serialized:', msg?.id?._serialized, 'msg.id.id:', msg?.id?.id);
    console.log('[WhatsApp] normalizeMessage() chamado - msg existe?', !!msg, 'msg.id?', !!msg?.id, 'msg.from?', !!msg?.from);
    
    const chatId = (msg.to && String(msg.to).endsWith('@g.us')) ? msg.to : msg.from;
    const isGroup = String(chatId).endsWith('@g.us');
    const userId = msg.fromMe
      ? (this.innerClient.info?.wid?._serialized || msg.from)
      : (isGroup ? (msg.author || msg.from) : msg.from);
    
    let extractedText = msg.body || '';
    if (!extractedText && (msg as any)._data) {
      const d = (msg as any)._data;
      extractedText = d.body || d.conversation || d.text || (typeof d.data === 'string' ? d.data : '') || '';
    }
    if (!extractedText && msg.type === 'image') {
      extractedText = msg.caption || '';
    }
    if (!extractedText && msg.type === 'video') {
      extractedText = msg.caption || '';
    }
    if (!extractedText && msg.type === 'document') {
      extractedText = msg.caption || '';
    }
    if (!extractedText && msg.type === 'location') {
      extractedText = msg.location?.description || '';
    }
    if (!extractedText && msg.type === 'vcard') {
      extractedText = msg.vcardParsed?.[0]?.displayName || '';
    }
    if (!extractedText && msg.type === 'order') {
      extractedText = msg.order?.title || '';
    }
    if (!extractedText && msg.type === 'call_log') {
      extractedText = msg.callLog?.type || '';
    }
    if (!extractedText && msg.type === 'payment') {
      extractedText = msg.payment?.note || '';
    }
    if (!extractedText && msg.type === 'product') {
      extractedText = msg.product?.title || '';
    }
    if (!extractedText && msg.type === 'sticker') {
      extractedText = msg.sticker?.id || '';
    }
    if (!extractedText && msg.type === 'buttons_response') {
      extractedText = msg.selectedButtonId || '';
    }
    if (!extractedText && msg.type === 'list_response') {
      extractedText = msg.listResponse?.title || msg.listResponse?.description || '';
    }
    if (!extractedText && msg.type === 'poll_creation') {
      extractedText = msg.poll?.name || '';
    }
    if (!extractedText && msg.type === 'e2e_notification') {
      extractedText = msg.e2eNotification?.type || '';
    }
    if (!extractedText && msg.type === 'unknown') {
      extractedText = msg.body || '';
    }
    if (!extractedText && (msg as any)._data) {
      const data = (msg as any)._data;
      extractedText = data.body || data.caption || data.text || '';
      if (!extractedText && data.listResponse) {
        extractedText = data.listResponse.title || data.listResponse.description || '';
      }
    }

    const messageId = msg.id?._serialized
      || msg.id?.id
      || (msg.id?.remote && msg.id?.id ? `${msg.id.remote}_${msg.id.id}` : null)
      || String(msg.id);

    const payload = {
      id: `wpp:${messageId}`,
      chatId,
      userId,
      userName: msg._data?.notifyName || msg.from,
      text: extractedText,
      timestamp: new Date(msg.timestamp * 1000),
      isFromMe: msg.fromMe,
      isCommand: false, // Será determinado pelo PlatformManager
      platform: 'whatsapp' as const,
      raw: {
        ...msg,
        isGroup,
        chat: msg.chat,
        author: msg.author,
        _data: msg._data // Preservar dados brutos para análise profunda no AutoMod
      },
      hasMedia: msg.hasMedia,
      mediaType: this.getMediaType(msg),
      replyToMessageId: msg.hasQuotedMsg ? `wpp:${msg.quotedMsg?.id._serialized}` : undefined,
      mentions: (msg.mentionedIds || []).map((id: string) => ({
        id: `wpp:${id}`,
        name: id.split('@')[0],
        isBot: false,
        platform: 'whatsapp' as const,
        raw: { id }
      }))
    };

    // Log de auditoria: confirma a entrega do payload normalizado ao messageHandler.
    // Trata @lid (identificador de privacidade/dispositivo) como conversa privada válida.
    console.log(`[WhatsAppAdapter] Payload normalizado e enviado ao handler: ID=${messageId} Chat=${chatId} User=${userId} Text="${payload.text}" isGroup=${isGroup}`);
    return payload;
  }

  private getMediaType(msg: Message): PlatformMessage['mediaType'] {
    if (!msg.hasMedia) return undefined;
    const type = msg.type;
    switch (type) {
      case 'image': return 'image';
      case 'video': return 'video';
      case 'audio':
      case 'ptt': return 'audio';
      case 'document': return 'document';
      case 'sticker': return 'sticker';
      case 'location': return 'location';
      case 'vcard': return 'contact';
      default: return undefined;
    }
  }

  async sendMessage(chatId: string, text: string, options?: SendOptions): Promise<PlatformMessage> {
    const thisHash = Math.random().toString(36).substring(7);
    const stack = new Error().stack;
    console.log(`[WhatsAppAdapter.sendMessage] ENTRY - thisHash: ${thisHash}, this.constructor.name: ${this.constructor.name}, chatId: ${chatId}`);
    console.log(`[WhatsAppAdapter.sendMessage] Stack trace:`, stack);
    
    // Remover prefixo wpp: se presente
    let cleanChatId = chatId.replace(/^wpp:/, '');
    // IMPORTANTE: NÃO converter @lid -> @c.us. O WWebJS moderno EXIGE o @lid como
    // destino de envio para esse contato; converter gera "No LID for user".
    // Mantemos o JID original (incluindo @lid) no envio.
    const targetJid = cleanChatId;
    console.log(`[WhatsAppAdapter.sendMessage] cleanChatId: ${cleanChatId} | targetJid: ${targetJid}`);
    console.log(`[WhatsAppAdapter] Enviando resposta para: ${targetJid}`);
    
    // FIX: Usar waitUntilMsgSent=true para aguardar o envio real ao servidor
    // Ref: whatsapp-web.js Client.sendMessage internalOptions.waitUntilMsgSent
    const sendOptions = {
      quotedMessageId: options?.replyToMessageId?.replace(/^wpp:/, ''),
      waitUntilMsgSent: true,
      sendSeen: false
    };

    const startTime = Date.now();
    let sent;
    try {
      sent = await this.innerClient.sendMessage(targetJid, text, sendOptions);
    } catch (sendErr: any) {
      const msg = String(sendErr?.message || '');
      // Falha conhecida com novos IDs @lid / WhatsApp Web atualizado:
      // "message.serialize is not a function" (interno do getMessageModel).
      // Fallback: resolver a conversa e enviar diretamente via chat.sendMessage(),
      // que contorna o modelo de mensagem problemático do client.sendMessage.
      if (msg.includes('serialize') || msg.includes('getMessageModel')) {
        console.warn(`[WhatsAppAdapter.sendMessage] sendMessage falhou (${msg}). Tentando fallback via getChatById+chat.sendMessage...`);
        try {
          const chat = await this.innerClient.getChatById(targetJid);
          sent = await chat.sendMessage(text, { quotedMessageId: sendOptions.quotedMessageId });
        } catch (fallbackErr: any) {
          console.error(`[WhatsAppAdapter.sendMessage] Fallback também falhou:`, {
            message: fallbackErr?.message,
            stack: fallbackErr?.stack
          });
          throw new Error(`Falha ao enviar mensagem (${targetJid}): ${fallbackErr?.message || msg}`);
        }
      } else {
        // Outras falhas de transporte (Puppeteer/CdpPage.evaluate) não mascaram o comando.
        console.error(`[WhatsAppAdapter.sendMessage] ERRO de transporte ao enviar para ${targetJid}:`, {
          message: msg,
          stack: sendErr?.stack,
          errorType: sendErr?.constructor?.name
        });
        throw new Error(`Falha de transporte ao enviar mensagem (${targetJid}): ${msg}`);
      }
    }
    const duration = Date.now() - startTime;
    
    console.log(`[WhatsAppAdapter.sendMessage] ⏱️ sendMessage demorou ${duration}ms`);
    console.log(`[WhatsAppAdapter.sendMessage] 📋 RETORNO: typeof: ${typeof sent}, constructor: ${sent?.constructor?.name || 'N/A'}`);
    console.log(`[WhatsAppAdapter.sendMessage] 📋 sent.id:`, sent?.id, 'sent.id._serialized:', sent?.id?._serialized);

    if (!sent || !sent.id) {
      // O WWebJS moderno (JIDs @lid / waitUntilMsgSent) nem sempre devolve o objeto
      // da mensagem serializada, mesmo quando o envio foi bem-sucedido. Se chegamos
      // aqui sem exceção, tratamos como sucesso e retornamos um payload mínimo em vez
      // de lançar erro falso ("erro interno ao executar comando").
      console.warn(`[WhatsAppAdapter.sendMessage] sendMessage não devolveu objeto serializado (sent=${typeof sent}); assumindo envio bem-sucedido para ${targetJid}.`);
      return {
        id: `wpp:${targetJid}-${Date.now()}`,
        chatId: `wpp:${targetJid}`,
        userId: '',
        text: text,
        isCommand: false,
        fromMe: true,
        timestamp: Date.now(),
        raw: null
      } as PlatformMessage;
    }
    
    console.log(`[WhatsAppAdapter.sendMessage] ✅ Mensagem enviada com sucesso`);
    return this.normalizeMessage(sent);
  }

  async sendMedia(chatId: string, media: MediaPayload, caption?: string): Promise<PlatformMessage> {
    const cleanChatId = chatId.replace(/^wpp:/, '');
    const mediaObject = media.data instanceof Buffer
      ? new (await import('whatsapp-web.js')).MessageMedia(media.mimetype || 'application/octet-stream', media.data.toString('base64'), media.filename)
      : await (await import('whatsapp-web.js')).MessageMedia.fromUrl(media.data as string);

    const sent = await this.innerClient.sendMessage(cleanChatId, mediaObject, { caption, waitUntilMsgSent: true });
    return this.normalizeMessage(sent);
  }

  async getChat(chatId: string): Promise<PlatformChat> {
    const originalChatId = chatId;
    const cleanChatId = chatId.replace(/^(wpp:|tg:|dc:)/, '');
    console.log(`[WhatsApp] getChat() chamado - chatId original: ${originalChatId} cleanChatId: ${cleanChatId} formato: formato WhatsApp`);

    try {
      const chat = await this.innerClient.getChatById(cleanChatId);
      return this.normalizeChat(chat);
    } catch (error: any) {
      // Workaround para Issue #201838: "r: r" error após atualização WhatsApp Web
      if (error.message === 'r' || error.message === 'r: r') {
        console.warn(`[WhatsApp] getChat() - Erro "r" detectado (Issue #201838).`);
        console.warn(`[WhatsApp] getChat() - Não é possível obter participantes neste momento.`);
        console.warn(`[WhatsApp] getChat() - Retornando chat com isPermissionsVerified: false para indicar falha.`);
        // Retornar chat indicando explicitamente que as permissões não puderam ser verificadas
        return {
          id: originalChatId,
          name: cleanChatId,
          isGroup: cleanChatId.endsWith('@g.us'),
          participants: [], // Vazio - permissões não verificadas
          raw: null,
          isPermissionsVerified: false // INDICADOR EXPLÍCITO DE FALHA
        };
      }
      console.error(`[WhatsApp] Erro em getChatById:`, {
        chatId: originalChatId,
        cleanChatId,
        error: error.message,
        stack: error.stack,
        errorType: error.constructor.name
      });
      throw error;
    }
  }

  async getUser(userId: string): Promise<PlatformUser> {
    const cleanUserId = userId.replace(/^wpp:/, '');
    const contact = await this.innerClient.getContactById(cleanUserId);
    return this.normalizeUser(contact);
  }

  async getChats(): Promise<PlatformChat[]> {
    const chats = await this.innerClient.getChats();
    return chats.map(c => this.normalizeChat(c));
  }

  async removeParticipant(chatId: string, userId: string): Promise<void> {
    const cleanChatId = chatId.replace(/^wpp:/, '');
    let cleanUserId = userId.replace(/^wpp:/, '');
    // O alvo pode vir como @lid (menção do WhatsApp Web atual). O WWebJS
    // removeParticipants espera @c.us. Converter @lid -> @c.us.
    if (cleanUserId.endsWith('@lid')) {
      cleanUserId = cleanUserId.replace('@lid', '@c.us');
    }
    console.log(`[WhatsApp] removeParticipant - chatId: ${cleanChatId} userId: ${cleanUserId}`);
    try {
      const chat = await this.innerClient.getChatById(cleanChatId);
      console.log(`[WhatsApp] removeParticipant - chat obtido: ${chat?.id?._serialized}`);
      await (chat as any).removeParticipants([cleanUserId]);
      console.log(`[WhatsApp] removeParticipant - SUCESSO para ${cleanUserId}`);
    } catch (err: any) {
      console.error(`[WhatsApp] removeParticipant ERRO:`, { msg: err?.message, stack: err?.stack?.split('\n').slice(0,3).join(' | ') });
      throw err;
    }
  }

  async banParticipant(chatId: string, userId: string): Promise<void> {
    const cleanChatId = chatId.replace(/^wpp:/, '');
    let cleanUserId = userId.replace(/^wpp:/, '');
    if (cleanUserId.endsWith('@lid')) {
      cleanUserId = cleanUserId.replace('@lid', '@c.us');
    }
    console.log(`[WhatsApp] banParticipant - chatId: ${cleanChatId} userId: ${cleanUserId}`);
    try {
      const chat = await this.innerClient.getChatById(cleanChatId);
      await (chat as any).removeParticipants([cleanUserId]);
      console.log(`[WhatsApp] banParticipant - SUCESSO para ${cleanUserId}`);
    } catch (err: any) {
      console.error(`[WhatsApp] banParticipant ERRO:`, { msg: err?.message, stack: err?.stack?.split('\n').slice(0,3).join(' | ') });
      throw err;
    }
    // Tenta bloquear o contato (best-effort) para evitar reentrada.
    try {
      const contact = await this.innerClient.getContactById(cleanUserId);
      if (contact && typeof (contact as any).block === 'function') {
        await (contact as any).block();
      }
    } catch (blockError) {
      console.warn(`[WhatsApp] banParticipant: falha ao bloquear contato ${cleanUserId}:`, blockError);
    }
  }

  private normalizeChat(chat: Chat): PlatformChat {
    return {
      id: `wpp:${chat.id._serialized}`,
      name: chat.name || (chat.isGroup ? 'Grupo' : 'Chat Privado'),
      isGroup: chat.isGroup,
      platform: 'whatsapp',
      participants: chat.participants?.map(p => {
        let raw = p.id._serialized || (p.id as any).user || String(p.id);
        if (raw.endsWith('@lid')) {
          const user = (p.id as any).user || raw.replace('@lid', '');
          raw = `${user}@c.us`;
        }
        return {
          id: `wpp:${raw}`,
          isAdmin: Boolean((p as any).isAdmin),
          isSuperAdmin: Boolean((p as any).isSuperAdmin),
        } as any;
      }),
      raw: chat,
      isPermissionsVerified: true // Chat obtido com sucesso, permissões verificadas
    };
  }

  private normalizeUser(contact: Contact): PlatformUser {
    return {
      id: `wpp:${contact.id._serialized}`,
      name: contact.pushname || contact.name || contact.number,
      username: contact.shortName,
      isBot: false,
      platform: 'whatsapp',
      raw: contact
    };
  }

  private normalizeUserId(id: string): string {
    return `wpp:${id}`;
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  onReady(handler: () => void): void {
    this.readyHandler = handler;
  }

  onDisconnected(handler: (reason: string) => void): void {
    this.disconnectedHandler = handler;
  }

  async shutdown(): Promise<void> {
    await this.innerClient.destroy();
    this.isReady = false;
  }

  getClient(): Client {
    return this.innerClient;
  }

  async initialize(): Promise<void> {
    // O construtor ja chama connect() (que cria o Client + initialize()).
    // Mantido por compatibilidade com o PlatformManager; se o client ja
    // foi inicializado pelo construtor, nao faz nada.
    if (this.innerClient && (this.innerClient as any)._initialized) return;
  }
}
