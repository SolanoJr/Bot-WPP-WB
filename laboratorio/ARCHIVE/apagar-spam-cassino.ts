#!/usr/bin/env node
/**
 * laboratorio/apagar-spam-cassino.ts
 *
 * Script de laboratório para:
 * 1. Descobrir dinamicamente o JID real do grupo "Figurinhas/Stickers" via /lab/groups.
 * 2. Localizar a mensagem do spammer indonésio (+62 823-6400-7211) ou excluir pelo ID fornecido.
 * 3. Enviar a ordem de exclusão silenciosa (revoke) ao WhatsApp via /lab/delete-message.
 * 4. Registrar o resultado completo em laboratorio/casino-delete-result.json.
 *
 * Execução no servidor:
 *   node dist/laboratorio/apagar-spam-cassino.js
 * ou passando o messageId direto:
 *   node dist/laboratorio/apagar-spam-cassino.js <MESSAGE_ID>
 */

import http from 'http';
import fs from 'fs';
import path from 'path';

const TEST_SERVER = 'http://127.0.0.1:3004';
const RESULT_FILE = path.join(process.cwd(), 'laboratorio', 'casino-delete-result.json');
const TARGET_PHONE = '6282364007211';
const GROUP_KEYWORD = 'Figurinhas';

function log(msg: string) {
  console.log(`[APAGAR-SPAM] ${msg}`);
}

function httpPost(url: string, data: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const body = JSON.stringify(data);
    const req = http.request({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      let resBody = '';
      res.on('data', chunk => resBody += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(resBody));
        } catch {
          resolve({ _raw: resBody, statusCode: res.statusCode });
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  log('===============================================================');
  log('INICIANDO LOCALIZAÇÃO E EXCLUSÃO SILENCIOSA DE MENSAGEM DE CASSINO');
  log('===============================================================');

  // 1. Descobrir grupos via testServer
  log('Consultando grupos ativos via testServer...');
  let groupJid = '';
  let groupName = '';

  try {
    const groupResp = await httpPost(`${TEST_SERVER}/lab/groups`, { platform: 'whatsapp' });
    if (groupResp?.ok && Array.isArray(groupResp.groups)) {
      log(`Grupos encontrados no bot: ${groupResp.groups.length}`);
      for (const g of groupResp.groups) {
        log(`  - [${g.id}] "${g.name}"`);
        if (g.name && (g.name.includes(GROUP_KEYWORD) || g.name.toLowerCase().includes('stickers'))) {
          groupJid = g.id;
          groupName = g.name;
        }
      }
    }
  } catch (err: any) {
    log(`Aviso ao consultar /lab/groups: ${err.message}`);
  }

  // Fallback se não achou dinamicamente
  if (!groupJid) {
    groupJid = '120363419033272638@g.us';
    groupName = 'Figurinhas/Stickers (fallback)';
    log(`Usando grupo fallback: ${groupJid}`);
  } else {
    log(`Grupo alvo confirmado: "${groupName}" (${groupJid})`);
  }

  // 2. Verificar se o messageId foi passado por argumento
  const argMessageId = process.argv[2]?.trim();
  let targetMessageId = argMessageId || '';
  let targetParticipant = `${TARGET_PHONE}@s.whatsapp.net`;

  if (targetMessageId) {
    log(`Message ID fornecido via linha de comando: ${targetMessageId}`);
  } else {
    log('Buscando mensagens no histórico recente via /lab/history...');
    try {
      await httpPost(`${TEST_SERVER}/lab/history`, {
        platform: 'whatsapp',
        groupJid,
        count: 150,
      });
      // Aguardar processamento breve
      await new Promise(r => setTimeout(r, 3000));
    } catch (err: any) {
      log(`Aviso ao solicitar histórico: ${err.message}`);
    }

    // Lê do captured-messages.jsonl
    const captureFile = path.join(process.cwd(), 'laboratorio', 'captured-messages.jsonl');
    if (fs.existsSync(captureFile)) {
      const lines = fs.readFileSync(captureFile, 'utf-8').trim().split('\n').filter(Boolean);
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const cap = JSON.parse(lines[i]);
          const isTargetGroup = cap.groupId === groupJid || cap.remoteJid === groupJid;
          const isSpammer = (cap.participant || '').includes(TARGET_PHONE) || (cap.senderJid || '').includes(TARGET_PHONE);
          const rawText = JSON.stringify(cap.rawPayloadSafe || '');
          const hasCasinoSignals = rawText.includes('kl7') || rawText.includes('CK7') || rawText.includes('vitórias');

          if (isTargetGroup && (isSpammer || hasCasinoSignals)) {
            targetMessageId = cap.messageId;
            targetParticipant = cap.participant || targetParticipant;
            log(`Mensagem de cassino encontrada no registro: ID=${targetMessageId}, remetente=${targetParticipant}`);
            break;
          }
        } catch { /* ignore */ }
      }
    }
  }

  if (!targetMessageId) {
    log('⚠️ Nenhum messageId específico foi encontrado automaticamente.');
    log('DICA: Você pode citar a mensagem no WhatsApp e enviar "$delete" diretamente.');
    log('OU executar: node dist/laboratorio/apagar-spam-cassino.js <MESSAGE_ID>');
    
    // Registra tentativa no arquivo de resultado
    fs.writeFileSync(RESULT_FILE, JSON.stringify({
      executedAt: new Date().toISOString(),
      groupJid,
      groupName,
      success: false,
      reason: 'messageId não localizado automaticamente e não informado por argumento'
    }, null, 2));
    return;
  }

  // 3. Executar o delete silencioso
  log(`Enviando ordem de delete para a mensagem ${targetMessageId} no grupo ${groupJid}...`);
  try {
    const deleteResp = await httpPost(`${TEST_SERVER}/lab/delete-message`, {
      platform: 'whatsapp',
      groupJid,
      messageId: targetMessageId,
      participant: targetParticipant,
      fromMe: false,
    });

    log(`Resposta do delete: ${JSON.stringify(deleteResp)}`);

    const result = {
      executedAt: new Date().toISOString(),
      groupJid,
      groupName,
      messageId: targetMessageId,
      participant: targetParticipant,
      deleteResult: deleteResp,
      success: deleteResp?.ok === true,
    };

    fs.writeFileSync(RESULT_FILE, JSON.stringify(result, null, 2));
    log('✅ Resultado salvo com sucesso em ' + RESULT_FILE);

    if (deleteResp?.ok) {
      log('🎉 MENSAGEM APAGADA SILENCIOSAMENTE COM SUCESSO NO WHATSAPP!');
    } else {
      log('❌ Falha ao apagar: ' + (deleteResp?.error || 'erro desconhecido'));
    }
  } catch (err: any) {
    log(`Erro fatal ao executar delete: ${err.message}`);
  }
}

main().catch(err => {
  console.error('[APAGAR-SPAM] Erro:', err);
  process.exit(1);
});
