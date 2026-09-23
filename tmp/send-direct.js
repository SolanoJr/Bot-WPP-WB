const { execSync } = require('child_process');
const { createConnection } = require('net');

// Connect to PM2 and run a script inside the bot process
const cmd = `
const pm = globalThis.__platformManager;
if (!pm) { console.log('NO_GLOBAL_PM'); process.exit(1); }
const adapter = pm.getAdapter('whatsapp:558581344211');
if (!adapter) { console.log('ADAPTER_NOT_FOUND'); process.exit(1); }
adapter.client.sendMessage('120363410094452673@g.us', '$menu')
  .then(r => {
    console.log('MSG_ID:' + (r?.key?.id || r?.id));
    console.log('MSG_KEY:' + JSON.stringify(r?.key || {}));
    process.exit(0);
  })
  .catch(e => { console.log('ERROR:' + e.message); process.exit(1); });
`;

const pm2Cmd = `pm2 trigger bot-wpp eval "${cmd.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`;
console.log('Sending $menu via bot...');

// Alternative: just use test endpoint but without $ to avoid artificial processing
const http = require('http');
const data = JSON.stringify({ platform: 'whatsapp:558581344211', command: 'menu', chatId: '120363410094452673@g.us' });

const req = http.request({ hostname: 'localhost', port: 3004, path: '/test', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': data.length } }, (res) => {
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => { console.log('Response:', body); process.exit(0); });
});
req.write(data);
req.end();
