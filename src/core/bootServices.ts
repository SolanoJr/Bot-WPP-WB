/**
 * Serviços de inicialização compartilhados entre whatsapp.ts (legado) e multiPlatform.ts
 */
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import metricsService from '../services/metricsService';
import { platformManager } from '../platforms/PlatformManager';

const WARRIOR_AUTH_KEY_LENGTH = 16;

export const getWarriorAuthKeyOrExit = (): string => {
  const key = String(process.env.WARRIOR_AUTH_KEY || '').trim();

  if (key.length !== WARRIOR_AUTH_KEY_LENGTH) {
    console.warn(
      `⚠️ [BOT-CONFIG] WARRIOR_AUTH_KEY tem tamanho inesperado: ${key.length} (esperado ${WARRIOR_AUTH_KEY_LENGTH}).`
    );
    console.warn('⚠️ [BOT-CONFIG] Continuando mesmo assim para permitir conexão...');
  }

  return key;
};

export const runPreFlightCheck = async (): Promise<boolean> => {
  console.log('🔍 [PREFLIGHT] Iniciando verificações críticas...');
  const warriorAuthKey = getWarriorAuthKeyOrExit();

  const keyParts =
    warriorAuthKey.length >= 8
      ? `${warriorAuthKey.substring(0, 4)}...${warriorAuthKey.substring(warriorAuthKey.length - 4)}`
      : warriorAuthKey
        ? 'CHAVE_PRESENTE_MAS_CURTA'
        : 'CHAVE_AUSENTE';
  console.log(`🔐 [PREFLIGHT] Debug de Chave Local: [${keyParts}] (Len: ${warriorAuthKey.length})`);

  const relayUrl = process.env.RELAY_URL || 'https://bot-wpp-relay.onrender.com';
  console.log(`🌐 [PREFLIGHT] Testando conexão com Relay: ${relayUrl}`);

  let healthOk = false;
  try {
    const healthResponse = await axios.get(`${relayUrl}/health`, {
      timeout: 5000,
      headers: { Accept: 'application/json' },
    });
    if (healthResponse.status === 200) {
      healthOk = true;
      console.log('✅ [PREFLIGHT] Relay Health OK - Status:', healthResponse.data.status);
    }
  } catch (error: any) {
    console.warn('⚠️ [PREFLIGHT] Falha ao checar health do Relay (continua).', error.message);
  }

  if (healthOk) {
    try {
      await axios.get(`${relayUrl}/pending/auth_preflight_test`, {
        timeout: 5000,
        headers: { Accept: 'application/json', 'x-api-key': warriorAuthKey },
      });
      console.log('✅ [PREFLIGHT] Autenticação com Relay: OK');
    } catch (authError: any) {
      if (authError.response?.status === 401) {
        console.error('⚠️  [PREFLIGHT] ERRO DE AUTENTICAÇÃO (401)!');
        console.error('🛑 A WARRIOR_AUTH_KEY do Bot não coincide com a do Relay.');
        process.exit(1);
      } else {
        console.warn('⚠️ [PREFLIGHT] Falha ao validar Auth:', authError.message);
      }
    }
  }

  const requiredVars = ['MASTER_USER', 'GEMINI_API_KEY'];
  const missingVars = requiredVars.filter((v) => !process.env[v]);
  if (missingVars.length) {
    console.warn('⚠️ [PREFLIGHT] Variáveis críticas ausentes:', missingVars.join(', '));
  } else {
    console.log('✅ [PREFLIGHT] Variáveis de ambiente OK');
  }

  const authPath = path.join(process.cwd(), '.wwebjs_auth');
  if (!fs.existsSync(authPath)) {
    console.log('📁 [PREFLIGHT] Criando pasta de autenticação...');
    fs.mkdirSync(authPath, { recursive: true });
  }
  console.log('✅ [PREFLIGHT] Sistema de arquivos OK');
  console.log(`✅ [PREFLIGHT] MASTER configurado: ${process.env.MASTER_USER}`);
  console.log('🎉 [PREFLIGHT] Verificações concluídas (continua mesmo com falhas).');

  return true;
};

export const startMetrics = async (): Promise<void> => {
  try {
    await metricsService.start();
    metricsService.startSystemMetricsCollection(60000);
    console.log('📊 [METRICS] Servidor de métricas iniciado com sucesso!');
  } catch (error: any) {
    console.error('⚠️  [METRICS] Erro ao iniciar servidor de métricas:', error.message);
  }
};

interface RelayLocationPayload {
  chatId: string;
  timestamp: number | string;
  contactName?: string;
  isGroup?: boolean;
  groupName?: string;
  location: {
    lat?: number | string;
    latitude?: number | string;
    lng?: number | string;
    lon?: number | string;
    longitude?: number | string;
    coords?: { lat?: number | string; lng?: number | string; lon?: number | string };
  };
}

export const startLocationPolling = (): void => {
  const relayUrl = process.env.RELAY_URL || 'https://bot-wpp-relay.onrender.com';
  const pollingInterval = 15000;
  const processedLocations = new Set<string>();
  const pendingChatIds = new Set<string>();

  const sendLocationResponse = async (location: RelayLocationPayload): Promise<void> => {
    try {
      const chatId = location.chatId;
      const loc = location.location;

      const rawLat = loc.lat ?? loc.latitude ?? loc.coords?.lat;
      const rawLon = loc.lng ?? loc.lon ?? loc.longitude ?? loc.coords?.lng ?? loc.coords?.lon;
      const lat = parseFloat(String(rawLat));
      const lon = parseFloat(String(rawLon));
      const timestamp = location.timestamp;

      if (!lat || !lon || Number.isNaN(lat) || Number.isNaN(lon)) {
        console.error(`❌ [POLLING] Coordenadas inválidas - Lat: ${lat}, Lon: ${lon}`);
        return;
      }

      let contactInfo = '';
      let chatInfo = '';

      if (location.contactName) {
        contactInfo = `👤 **Usuário:** ${location.contactName}\n`;
      }
      if (location.isGroup && location.groupName) {
        chatInfo = `🏢 **Grupo:** ${location.groupName}\n`;
      } else if (!location.isGroup) {
        chatInfo = '💬 **Chat:** Privado\n';
      }

      const response = [
        '📍 **LOCALIZAÇÃO RECEBIDA!**',
        '',
        contactInfo,
        chatInfo,
        `🕒 **Data/Hora:** ${new Date(timestamp).toLocaleString('pt-BR')}`,
        '',
        '🗺️ **LOCALIZAÇÃO:**',
        '📍 Localização em tempo real',
        '',
        '🗺️ **Google Maps:**',
        `🔗 https://www.google.com/maps?q=${lat},${lon}`,
        '',
        '📍 **Coordenadas:**',
        `▸ Latitude: ${lat}`,
        `▸ Longitude: ${lon}`,
        '',
        `🆔 **Chat ID:** ${chatId}`,
      ].join('\n');

      const whatsappClient = platformManager.getClient('whatsapp');
      if (!whatsappClient?.isReady) {
        console.warn(`⚠️ [POLLING] WhatsApp indisponível para enviar localização ao chat ${chatId}`);
        return;
      }

      await whatsappClient.sendMessage(chatId, response);
      console.log(`✅ [POLLING] Localização enviada com sucesso para ${chatId}`);
    } catch (error: any) {
      console.error(`❌ [POLLING] Erro ao enviar localização: ${error.message}`);
    }
  };

  const checkPendingLocations = async (): Promise<void> => {
    try {
      const whatsappClient = platformManager.getClient('whatsapp');
      if (!whatsappClient?.isReady) {
        return;
      }

      if (pendingChatIds.size === 0) {
        return;
      }

      console.log(`🔍 [POLLING] Verificando localizações pendentes... (${pendingChatIds.size} chatIds)`);

      for (const chatId of pendingChatIds) {
        try {
          const checkUrl = `${relayUrl}/pending/${encodeURIComponent(chatId)}`;
          const response = await axios.get(checkUrl, {
            timeout: 5000,
            headers: {
              Accept: 'application/json',
              'x-api-key': getWarriorAuthKeyOrExit(),
            },
          });

          if (response.status === 204) {
            continue;
          }

          const location = response.data as RelayLocationPayload;
          if (!location?.location) {
            continue;
          }

          const locationId = `${location.chatId}_${location.timestamp}`;
          if (processedLocations.has(locationId)) {
            continue;
          }

          processedLocations.add(locationId);
          await sendLocationResponse(location);
          pendingChatIds.delete(chatId);
          console.log(`✅ [POLLING] ChatId ${chatId} removido dos pendentes`);
        } catch (error: any) {
          if (error.response?.status !== 204) {
            console.log(`⚠️  [POLLING] Erro ao verificar ${chatId}: ${error.message}`);
          }
        }
      }
    } catch (error: any) {
      console.log(`⚠️  [POLLING] Erro geral: ${error.message}`);
    }
  };

  global.pendingChatIds = pendingChatIds;

  let isChecking = false;
  const scheduleNextCheck = async (): Promise<void> => {
    if (isChecking) {
      setTimeout(scheduleNextCheck, pollingInterval);
      return;
    }

    isChecking = true;
    try {
      await checkPendingLocations();
    } catch (error: any) {
      console.error(`❌ [POLLING] Erro inesperado no ciclo: ${error.message}`);
    } finally {
      isChecking = false;
      setTimeout(scheduleNextCheck, pollingInterval);
    }
  };

  console.log(`🔄 [POLLING] Iniciando verificação de localizações a cada ${pollingInterval / 1000}s`);
  scheduleNextCheck();
};

declare global {
  // eslint-disable-next-line no-var
  var pendingChatIds: Set<string> | undefined;
}
