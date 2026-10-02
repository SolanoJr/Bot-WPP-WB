/**
 * Padronização e consistência da interface.
 *
 * Garante que:
 *   - todo comando citado no $menu/$help EXISTE no registro;
 *   - não há aliases em conflito (apontando para comandos diferentes);
 *   - a nomenclatura exibida segue o padrão oficial (Anti-*, PT-BR);
 *   - o status do AutoMod usa os nomes oficiais;
 *   - Boas-Vindas/Apresentações NÃO aparecem como detectores;
 *   - Anti-Link não aparece como "AutoLink" e Anti-Cassino não como "Casino".
 *
 * Lê o código-fonte real (index.ts, menu.ts, help.ts, modToggle.ts) para não
 * depender de mocks que poderiam divergir do que está registrado.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/** Extrai as chaves registradas no objeto `commands` de index.ts. */
function registeredCommands(): string[] {
  const s = read('src/bot/commands/index.ts');
  const start = s.indexOf('const commands');
  const open = s.indexOf('{', start);
  let depth = 0, end = -1;
  for (let i = open; i < s.length; i++) {
    if (s[i] === '{') depth++;
    else if (s[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  const body = s.slice(open + 1, end);
  return [...body.matchAll(/^\s*'?([a-z0-9_]+)'?\s*:/gm)].map(m => m[1]);
}

/** Comandos citados como `$nome` em um arquivo. */
function citedCommands(relPath: string): string[] {
  const src = read(relPath);
  return [...new Set([...src.matchAll(/\$([a-z0-9_]+)/gi)].map(m => m[1].toLowerCase()))];
}

describe('1+3+4. Comandos citados nas interfaces existem', () => {
  const reg = new Set(registeredCommands());

  it('o registro tem comandos (sanidade)', () => {
    expect(reg.size).toBeGreaterThan(50);
  });

  it('$menu não cita comando inexistente', () => {
    const faltando = citedCommands('src/bot/commands/menu.ts').filter(c => !reg.has(c));
    expect(faltando).toEqual([]);
  });

  it('$help não cita comando inexistente', () => {
    const faltando = citedCommands('src/bot/commands/help.ts').filter(c => !reg.has(c));
    expect(faltando).toEqual([]);
  });

  it('$jogos não cita comando inexistente', () => {
    const faltando = citedCommands('src/bot/commands/jogos.ts').filter(c => !reg.has(c));
    expect(faltando).toEqual([]);
  });
});

describe('5. Comandos críticos estão registrados', () => {
  const reg = new Set(registeredCommands());
  const criticos = [
    'menu', 'help', 'ping', 'alive',
    'automod', 'antispam', 'antilink', 'antibot', 'anticassino', 'antiestrangeiro',
    'punicao', 'anuncio', 'auditonly',
    'bemvindo', 'setwelcome', 'apresentar', 'apresentacao',
    'kick', 'ban', 'banidos', 'mute', 'desmute', 'promover',
    'delete', 'cmdtoggle', 'screen', 'stats', 'info', 'grupos', 'admin',
  ];

  for (const c of criticos) {
    it(`$${c} está registrado`, () => {
      expect(reg.has(c)).toBe(true);
    });
  }
});

describe('2. Aliases não entram em conflito', () => {
  it('aliases legados apontam para a MESMA instância do comando oficial', () => {
    const s = read('src/bot/commands/modToggle.ts');
    // autolink = antilink, casino = anticassino, remover = punicao, detectar = anuncio
    expect(s).toMatch(/autolinkModCommand\s*=\s*antilinkModCommand/);
    expect(s).toMatch(/casinoModCommand\s*=\s*anticassinoModCommand/);
    expect(s).toMatch(/removerModCommand\s*=\s*punicaoModCommand/);
    expect(s).toMatch(/detectarModCommand\s*=\s*anuncioModCommand/);
  });

  it('cada alias aponta para um comando distinto (sem colisão)', () => {
    const s = read('src/bot/commands/modToggle.ts');
    const pares = [
      ['autolinkModCommand', 'antilinkModCommand'],
      ['casinoModCommand', 'anticassinoModCommand'],
      ['removerModCommand', 'punicaoModCommand'],
      ['detectarModCommand', 'anuncioModCommand'],
    ];
    const alvos = pares.map(([alias]) => {
      const m = s.match(new RegExp(`${alias}\\s*=\\s*(\\w+)`));
      return m?.[1];
    });
    // Nenhum alias deve apontar para o mesmo alvo de outro
    expect(new Set(alvos).size).toBe(alvos.length);
  });

  it('LEGACY_ALIASES mapeia nome legado → nome oficial', () => {
    const s = read('src/bot/commands/modToggle.ts');
    expect(s).toMatch(/autolink:\s*'antilink'/);
    expect(s).toMatch(/casino:\s*'anticassino'/);
    expect(s).toMatch(/remover:\s*'punicao'/);
    expect(s).toMatch(/detectar:\s*'anuncio'/);
  });
});

describe('6+7. Nomenclatura exibida padronizada', () => {
  const mod = read('src/bot/commands/modToggle.ts');

  it('status usa os nomes oficiais dos detectores', () => {
    expect(mod).toContain('Anti-Spam');
    expect(mod).toContain('Anti-Link');
    expect(mod).toContain('Anti-Bot');
    expect(mod).toContain('Anti-Cassino');
    expect(mod).toContain('Anti-Estrangeiro');
  });

  it('a estrutura do status é DETECTORES / AÇÕES / AUTOMAÇÕES', () => {
    expect(mod).toContain('*DETECTORES*');
    expect(mod).toContain('*AÇÕES / MODO*');
    expect(mod).toContain('*AUTOMAÇÕES*');
  });

  it('a flag `detectar` é exibida como Anúncio, não como Detecção', () => {
    expect(mod).toContain('Anúncio no grupo');
    // Não deve existir rótulo que sugira que a detecção é desligável
    expect(mod).not.toMatch(/label:\s*'Detecção'/);
  });

  it('a flag `remover` é exibida como Punição', () => {
    expect(mod).toContain('Punição');
  });
});

describe('8. Welcome/Apresentações NÃO aparecem como detectores', () => {
  const mod = read('src/bot/commands/modToggle.ts');

  it('Boas-Vindas e Apresentações estão no bloco AUTOMAÇÕES', () => {
    const idxAuto = mod.indexOf('*AUTOMAÇÕES*');
    const idxBV = mod.indexOf('Boas-Vindas', idxAuto);
    const idxAp = mod.indexOf('Apresentações', idxAuto);
    expect(idxAuto).toBeGreaterThan(-1);
    expect(idxBV).toBeGreaterThan(idxAuto);
    expect(idxAp).toBeGreaterThan(idxAuto);
  });

  it('Boas-Vindas e Apresentações NÃO estão no bloco DETECTORES', () => {
    const idxDet = mod.indexOf('*DETECTORES*');
    const idxAcoes = mod.indexOf('*AÇÕES / MODO*');
    const blocoDet = mod.slice(idxDet, idxAcoes);
    expect(blocoDet).not.toContain('Boas-Vindas');
    expect(blocoDet).not.toContain('Apresentações');
  });
});

describe('9+10. Nomes legados não vazam para a interface', () => {
  it('Anti-Link não aparece como "AutoLink" no menu/help', () => {
    expect(read('src/bot/commands/menu.ts')).not.toMatch(/AutoLink/i);
    expect(read('src/bot/commands/help.ts')).not.toMatch(/AutoLink/i);
  });

  it('Anti-Cassino não aparece como "Cassino" isolado no menu/help', () => {
    // Toda ocorrência de "Cassino" deve vir precedida de "Anti-"
    for (const f of ['src/bot/commands/menu.ts', 'src/bot/commands/help.ts']) {
      const src = read(f);
      const ocorrencias = [...src.matchAll(/Cassino/g)].length;
      const comAnti = [...src.matchAll(/Anti-Cassino/g)].length;
      expect(ocorrencias).toBe(comAnti);
    }
  });

  it('o menu exibe os comandos com nomes oficiais', () => {
    const menu = read('src/bot/commands/menu.ts');
    expect(menu).toContain('$antilink');
    expect(menu).toContain('$anticassino');
    expect(menu).toContain('$punicao');
    expect(menu).toContain('$anuncio');
  });
});

describe('$menu e $help não citam comandos mortos', () => {
  it('não há referência a $lista1..$lista3 (comandos inexistentes)', () => {
    for (const f of ['src/bot/commands/menu.ts', 'src/bot/commands/help.ts']) {
      expect(read(f)).not.toMatch(/\$lista[123]/);
    }
  });
});

describe('11. Comandos de admin marcados como admin na interface', () => {
  it('$menu marca as seções de admin', () => {
    const menu = read('src/bot/commands/menu.ts');
    expect(menu).toMatch(/AUTOMOD\*? _\(admin\)_/);
    expect(menu).toMatch(/AUTOMAÇÕES\*? _\(admin\)_/);
    expect(menu).toMatch(/ADMINISTRAÇÃO\*? _\(admin\)_/);
  });
});
