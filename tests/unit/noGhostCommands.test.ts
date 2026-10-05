/**
 * Anti-regressão: documentação e menu NÃO podem anunciar comandos inexistentes.
 *
 * Contexto: o `$menu` já exibiu 13 comandos de lista (`$lista1`…`$lista3del`)
 * que nunca existiram em `src/`. Este teste impede que isso volte a acontecer.
 *
 * Também garante que os comandos de LISTAS continuem ausentes (recurso não
 * implementado) — se alguém implementá-los, este teste deve ser atualizado.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/** Comandos registrados no objeto `commands`. */
function registered(): Set<string> {
  const idx = read('src/bot/commands/index.ts');
  const start = idx.indexOf('const commands');
  const open = idx.indexOf('{', start);
  let d = 0, end = -1;
  for (let i = open; i < idx.length; i++) {
    if (idx[i] === '{') d++;
    else if (idx[i] === '}') { d--; if (d === 0) { end = i; break; } }
  }
  const body = idx.slice(open + 1, end);
  return new Set([...body.matchAll(/^\s*'?([a-z0-9_]+)'?\s*:/gm)].map(m => m[1]));
}

/** Comandos citados como `$nome` em um arquivo. */
function cited(file: string): string[] {
  const src = read(file);
  return [...new Set([...src.matchAll(/\$([a-z0-9_]+)/gi)].map(m => m[1].toLowerCase()))];
}

describe('anti-regressão: menu/help não anunciam comandos fantasmas', () => {
  const reg = registered();

  it('o registro tem comandos (sanidade)', () => {
    expect(reg.size).toBeGreaterThan(50);
  });

  for (const f of ['src/bot/commands/menu.ts', 'src/bot/commands/help.ts', 'src/bot/commands/jogos.ts']) {
    it(`${path.basename(f)} não cita comando inexistente`, () => {
      const faltando = cited(f).filter(c => !reg.has(c));
      expect(faltando).toEqual([]);
    });
  }
});

describe('comandos de LISTAS: recurso não implementado', () => {
  const reg = registered();
  const LISTAS = [
    'lista1', 'lista2', 'lista3',
    'lista1add', 'lista2add', 'lista3add',
    'lista1edit', 'lista2edit', 'lista3edit',
    'lista1del', 'lista2del', 'lista3del',
  ];

  it('nenhum comando de lista está registrado', () => {
    const existentes = LISTAS.filter(c => reg.has(c));
    expect(existentes).toEqual([]);
  });

  it('nenhum arquivo de comando de lista existe em src/', () => {
    for (const c of LISTAS) {
      expect(fs.existsSync(path.join(ROOT, 'src/bot/commands', `${c}.ts`))).toBe(false);
    }
  });

  it('$menu não anuncia comandos de lista', () => {
    const menu = read('src/bot/commands/menu.ts');
    for (const c of LISTAS) {
      expect(menu).not.toContain('$' + c);
    }
  });

  it('$help não anuncia comandos de lista', () => {
    const help = read('src/bot/commands/help.ts');
    for (const c of LISTAS) {
      expect(help).not.toContain('$' + c);
    }
  });

  it('a documentação não anuncia comandos de lista como existentes', () => {
    const docs = ['README.md', 'docs/TECHNICAL.md', 'docs/AI_CONTEXT.md', 'docs/TESTING.md'];
    for (const d of docs) {
      const p = path.join(ROOT, d);
      if (!fs.existsSync(p)) continue;
      const s = read(d);
      for (const c of LISTAS) {
        // Não pode haver "$listaN" fora de contexto de "não existe"/"removido"
        const re = new RegExp('\\$' + c + '\\b', 'g');
        const matches = s.match(re) || [];
        expect(matches.length).toBe(0);
      }
    }
  });
});
