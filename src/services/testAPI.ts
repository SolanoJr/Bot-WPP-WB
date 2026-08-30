// src/services/testAPI.ts
// API HTTP para testes - permite enviar comandos diretamente ao bot

import http from 'http';
import { platformManager } from '../platforms/PlatformManager';
import url from 'url';

export function startTestAPI(port: number = 3003): void {
  const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url || '', true);
    
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }
    
    if (req.method !== 'POST') {
      res.writeHead(405);
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }
    
    // Parse body
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const { platform, command, target } = data;
        
        if (!platform || !command) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'Missing platform or command' }));
          return;
        }
        
        // Enviar comando para o PlatformManager
        const result = await platformManager.executeTestCommand(platform, command, target);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, result }));
      } catch (e: any) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: e.message }));
      }
    });
  });
  
  server.listen(port, () => {
    console.log(`[TestAPI] Servidor de testes iniciado na porta ${port}`);
    console.log(`[TestAPI] Exemplo: curl -X POST http://localhost:${port}/test -d '{"platform":"discord","command":"$menu"}'`);
  });
}
