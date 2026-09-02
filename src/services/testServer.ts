import http from 'node:http';
import { PlatformManager } from '../platforms/PlatformManager';
import logger from './loggerService';

/**
 * Servidor de testes HTTP na porta 3004.
 * Permite injetar comandos diretamente no bot via POST /test
 *
 * Uso: curl -X POST http://localhost:3004/test -d '{"platform":"discord","command":"$menu"}'
 *
 * Nota de arquitetura: o PlatformManager é um singleton, mas o bundler (tsup)
 * pode instanciar escopos de módulo separados por bundle. A instância "viva"
 * (com adapters registrados) é publicada em `globalThis.__platformManager` por
 * multiPlatform.ts. Aqui preferimos `getInstance()`, caindo para o global se o
 * bundle corrente não compartilhar o mesmo escopo. Isso garante que o testServer
 * sempre opera sobre a instância real.
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

        const pm: PlatformManager =
          (globalThis as any).__platformManager || PlatformManager.getInstance();

        const prefix = '$';
        const trimmed = command.trim();
        if (!trimmed.startsWith(prefix)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Command must start with $' }));
          return;
        }
        const adapter = pm.getAdapter(platform as any);
        if (!adapter) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Plataforma não encontrada: ${platform}` }));
          return;
        }
        // Usa o método público executeTestCommand (que monta a PlatformMessage e
        // despacha pelo handleIncomingMessage da instância real).
        const result = await pm.executeTestCommand(platform, command);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, platform, command, result }));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
  });

  server.listen(port, '127.0.0.1', () => {
    logger.info(`[TestServer] Servidor de testes iniciado`, { port });
    logger.info(`[TestServer] Exemplo: curl -X POST http://localhost:${port}/test -d '{"platform":"discord","command":"$menu"}'`);
  });
}
