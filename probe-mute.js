require('dotenv').config();
const http = require('http');
const dollar = String.fromCharCode(36);
const text = dollar + 'mute';
const payload = JSON.stringify({
  groupId: '120363410094452673@g.us',
  senderId: process.env.MASTER_USER,
  text,
  mentions: ['5511999999999@c.us']
});
console.log('PAYLOAD', payload);
const req = http.request({host:'127.0.0.1',port:3004,path:'/lab/inject-message',method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload)}},res=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>console.log('HTTP',res.statusCode,d))});
req.write(payload); req.end();
