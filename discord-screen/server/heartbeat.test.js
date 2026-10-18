/**
 * O vigia de sockets mortos, ciclo a ciclo, sem relógio de verdade.
 *
 * O tick de 15s do setInterval não é controlável pelo teste — o módulo já o
 * criou no import — então o ciclo vive em função exportada, e este arquivo a
 * chama com sockets de mentira. O que interessa é a regra nova do INC-005:
 * um miss perdoa (celular em background suspende o JS por mais de um ciclo),
 * dois seguidos derrubam (o socket morreu de verdade).
 */
import { describe, expect, it } from 'vitest';
import { tickHeartbeat } from './index.js';

function socketMorto() {
  return {
    __alive: false,
    pings: 0,
    terminado: false,
    ping() {
      this.pings += 1;
    },
    terminate() {
      this.terminado = true;
    },
  };
}

describe('heartbeat', () => {
  it('um miss não derruba: perdoa e pinguia de novo (INC-005)', () => {
    const ws = socketMorto();
    tickHeartbeat([ws]);
    expect(ws.terminado).toBe(false);
    expect(ws.pings).toBe(1);
  });

  it('dois misses seguidos terminam o socket', () => {
    const ws = socketMorto();
    tickHeartbeat([ws]);
    tickHeartbeat([ws]);
    expect(ws.terminado).toBe(true);
  });

  it('pong no meio zera a contagem — o miss volta a contar de um', () => {
    const ws = socketMorto();
    tickHeartbeat([ws]); // 1º miss: perdoado.
    ws.__alive = true; // O pong chegou entre os ciclos.
    tickHeartbeat([ws]); // Misses zeram, e o ciclo pinguia de novo.
    ws.__alive = false; // Suspensão de novo — é um miss NOVO, não o segundo.
    tickHeartbeat([ws]);
    expect(ws.terminado).toBe(false);
    expect(ws.pings).toBe(3);
  });
});
