const http = require('http');

// Enviar $menu SEM processar comando (sendOnly)
const data = JSON.stringify({
  platform: 'whatsapp:558581344211',
  command: '$menu',
  chatId: '120363410094452673@g.us',
  sendOnly: true
});

const req = http.request({
  hostname: 'localhost',
  port: 3004,
  path: '/test',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  }
}, (res) => {
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Response:', body);
    process.exit(0);
  });
});
req.write(data);
req.end();
