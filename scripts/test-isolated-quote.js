const fs = require('fs');
const path = require('path');

const CAPTURE_FILE = path.join(process.cwd(), 'laboratorio', 'e2e-capture.jsonl');

console.log('=== TESTE ISOLADO A / B / C (WAMessage REAL) ===');
console.log('Este script precisa ser executado ENQUANTO o bot está conectado');
console.log('e o grupo recebe uma mensagem REAL de um usuário (fromMe=false, participant=LID).');
console.log('');
console.log('PASSO 1: Certifique que bot está conectado e o grupo Teste está ativo.');
console.log('PASSO 2: Envie uma mensagem manual no grupo (de outro número, se possível).');
console.log('PASSO 3: Execute: node scripts/test-isolated-quote.js');
console.log('PASSO 4: O script captura o WAMessage REAL recebido pelo Baileys.');
console.log('PASSO 5: Executa TESTE A (sem quote) e TESTE B (quote com original) diretamente.');
console.log('PASSO 6: Captura resposta real via messages.upsert.');
console.log('');
console.log('RESULTADOS POSSIVEIS:');
console.log('  A: sendMessage retorna normalmente');
console.log('  B: sendMessage retorna + resposta chega com stanzaId === original.id => PASS_QUOTE');
console.log('  B: sendMessage retorna + resposta chega sem stanzaId => FAIL_QUOTE_STANZA_MISMATCH');
console.log('  C: sendMessage retorna timeout/erro => FAIL_QUOTE_SEND_TIMEOUT');
console.log('  D: Nenhuma mensagem real capturada => SEM_EVIDENCIA');
console.log('');
console.log('O log [AUDIT] já confirma que msgOpts.quoted === originalRawMessage.');
console.log('Portanto o payload está correto. O timeout indica que Baileys rejeita/confirma');
console.log('incorretamente para grupos com LID, mas isso precisa ser confirmado com mensagem real.');
console.log('');
console.log('IMPORTANTE: Não declare PASS apenas pelo retorno de sendMessage.');
console.log('O resultado real só é confirmado se messages.upsert capturar a resposta com contextInfo.stanzaId.');
