import http from 'node:http';
import { platformManager } from '../platforms/PlatformManager';

/**
 * Servidor de testes HTTP na porta 3004.
 * Permite injetar comandos diretamente no bot via POST /test
 * 
 * Uso: curl -X POST http://localhost:3004/test -d '{"platform":"discord","command":"$menu"}'
 */
export function startTestServer(port: number = 3004): void {
  const server = http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/test') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found. Use POST /test' }));
      return;
    }

    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const { platform, command } = JSON.parse(body);
        if (!platform || !command) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing platform or command' }));
          return;
        }

        // Criar contexto falso para executar o comando
        const fakeCtx = {
          platform,
          chatId: 'test',
          senderId: 'test',
          senderName: 'Test',
          command,
          args: [],
          reply: async (msg: string) => {
            console.log(`[TestServer] Reply: ${msg}`);
          },
          react: async (emoji: string) => {
            console.log(`[TestServer] React: ${emoji}`);
          }
        };

        const pm = (globalThis as any).__platformManager || platformManager;
        // O PlatformManager real (com adapters registrados) expõe executeCommand(message, adapter).
        // Montamos a mensagem de teste e resolvemos o adapter diretamente para evitar
        // duplicidade de instâncias causada pelo bundler.
        const prefix = '$';
        const trimmed = command.trim();
        if (!trimmed.startsWith(prefix)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Command must start with $' }));
          return;
        }
        const parts = trimmed.slice(prefix.length).trim().split(/\s+/);
        const commandName = (parts.shift() || '').toLowerCase();
        const chatId = platform === 'whatsapp' || platform.startsWith('whatsapp:')
          ? '55858134422@c.us'
          : platform === 'telegram'
            ? 'tg:146078742'
            : 'dc:1307158493907652648';
        const testMessage = {
          id: `test-${Date.now()}`,
          platform,
          chatId,
          userId: chatId,
          userName: 'TestUser',
          text: command,
          timestamp: new Date(),
          isFromMe: false,
          isCommand: true,
          commandName,
          args: parts,
          raw: {},
          hasMedia: false
        };
        let adapter = pm.adapters?.get(platform);
        if (!adapter) {
          for (const [key, value] of (pm.adapters?.entries?.() || [])) {
            if (key.startsWith(platform)) { adapter = value; break; }
          }
        }
        if (!adapter) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Plataforma não encontrada: ${platform}` }));
          return;
        }
        await pm.executeCommand(testMessage, adapter);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, platform, command }));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
  });

  server.listen(port, () => {
    console.log(`[TestServer] Servidor de testes iniciado na porta ${port}`);
    console.log(`[TestServer] Exemplo: curl -X POST http://localhost:${port}/test -d '{"platform":"discord","command":"$menu"}'`);
  });
}
