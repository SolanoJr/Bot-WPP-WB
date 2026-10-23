import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { startTestServer } from '../../src/services/testServer';

/**
 * Teste de WIRING HTTP dos endpoints de injeção.
 *
 * Por que existe: o bug de 801062e (endpoints de injeção inalcançáveis por
 * causa de um `return;` espúrio + posicionamento depois do fallthrough de
 * comando) passou pelo tsc e pelos 15 testes unitários. Só foi pego quando o
 * deploy fez um curl real. Este teste sobe o servidor de verdade e bate nos
 * endpoints — pega essa classe de erro sem precisar de deploy.
 *
 * A asserção central é "NUNCA cai no fallthrough de comando": o 400 com
 * "Missing platform or command" é a assinatura inequívoca do bug de wiring.
 */

const GRUPO_TESTE = '120363410094452673@g.us';
const GRUPO_FIGURINHAS = '120363419033272638@g.us';
const USUARIO_FAKE = '5511999999999@c.us';

let server: http.Server;
let base: string;

async function post(path: string, body: unknown): Promise<{ status: number; body: string }> {
  const res = await fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.text() };
}

describe('lab HTTP wiring', () => {
  beforeAll(async () => {
    server = startTestServer(0);
    await new Promise<void>((resolve) => server.on('listening', resolve));
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('Sem porta alocada');
    base = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    server.closeAllConnections?.();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('GET /lab/stats responde 200 (servidor no ar)', async () => {
    const res = await fetch(base + '/lab/stats');
    expect(res.status).toBe(200);
  });

  it('rejecta grupo fora da allowlist com 403 e mensagem própria', async () => {
    const { status, body } = await post('/lab/inject-message', {
      groupId: GRUPO_FIGURINHAS,
      senderId: USUARIO_FAKE,
      text: 'oi',
    });

    expect(status).toBe(403);
    expect(body).toContain('Grupo não permitido');
  });

  it('rejecta grupo fora da allowlist no endpoint de participante', async () => {
    const { status, body } = await post('/lab/inject-participant-event', {
      groupId: GRUPO_FIGURINHAS,
      userId: USUARIO_FAKE,
      action: 'add',
    });

    expect(status).toBe(403);
    expect(body).toContain('Grupo não permitido');
  });

  it('grupo válido NUNCA cai no fallthrough de comando', async () => {
    const { status, body } = await post('/lab/inject-message', {
      groupId: GRUPO_TESTE,
      senderId: USUARIO_FAKE,
      text: '$lista',
    });

    // No ambiente de teste não há adapter conectado, então 404 é o resultado
    // legítimo. O que NUNCA pode acontecer é o 400 do fallthrough — essa é a
    // assinatura do bug de wiring que este teste trava.
    expect(status).not.toBe(400);
    expect(body).not.toContain('Missing platform or command');
  });

  it('payload incompleto no participante → 400 com mensagem própria', async () => {
    const { status, body } = await post('/lab/inject-participant-event', {
      groupId: GRUPO_TESTE,
    });

    expect(status).toBe(400);
    expect(body).toContain('Missing userId');
  });

  it('/lab/group-info sem groupJid → 400 com mensagem própria', async () => {
    const { status, body } = await post('/lab/group-info', {});

    expect(status).toBe(400);
    expect(body).toContain('Missing groupJid');
  });

  it('/lab/group-info com groupJid, sem adapter conectado → 503 (não 400 de fallthrough)', async () => {
    const { status, body } = await post('/lab/group-info', { groupJid: GRUPO_FIGURINHAS });

    // Sem adapter no ambiente de teste: 503 legítimo. O 400 de fallthrough
    // ("Missing platform or command") é a assinatura do bug de wiring.
    expect(status).toBe(503);
    expect(body).not.toContain('Missing platform or command');
  });

  it('/lab/remove-and-add sem params → 400 com mensagem própria', async () => {
    const { status, body } = await post('/lab/remove-and-add', { groupJid: GRUPO_FIGURINHAS });

    expect(status).toBe(400);
    expect(body).toContain('Missing groupJid or userJid');
  });

  it('/lab/remove-and-add com params, sem adapter conectado → 503 (não 400 de fallthrough)', async () => {
    const { status, body } = await post('/lab/remove-and-add', {
      groupJid: GRUPO_FIGURINHAS,
      userJid: USUARIO_FAKE,
    });

    expect(status).toBe(503);
    expect(body).not.toContain('Missing platform or command');
  });
});
