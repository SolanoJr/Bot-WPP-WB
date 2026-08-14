const fs = require('fs');
const path = require('path');
const https = require('https');

// lê .env manualmente (sem dependências)
const envPath = path.join('/home/solanojr/bot-wpp', '.env');
const envRaw = fs.readFileSync(envPath, 'utf8');
const keyLine = envRaw.split('\n').find(l => l.startsWith('GEMINI_API_KEY='));
const KEY = keyLine ? keyLine.split('=').slice(1).join('=') : '';
console.log('key_len=', KEY.length);

const body = JSON.stringify({
  contents: [{ parts: [{ text: 'Responda apenas: oi' }] }],
  generationConfig: { maxOutputTokens: 20 }
});

const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${KEY}`;
const req = https.request(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  timeout: 20000
}, (res) => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    console.log('STATUS', res.statusCode);
    console.log('BODY', data.slice(0, 500));
  });
});
req.on('error', e => console.log('REQ_ERROR', e.message));
req.write(body);
req.end();
