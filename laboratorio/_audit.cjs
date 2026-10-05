const fs = require('fs');

// 1. Comandos registrados
const idx = fs.readFileSync('src/bot/commands/index.ts', 'utf8');
const start = idx.indexOf('const commands');
const open = idx.indexOf('{', start);
let d = 0, end = -1;
for (let i = open; i < idx.length; i++) {
  if (idx[i] === '{') d++;
  else if (idx[i] === '}') { d--; if (d === 0) { end = i; break; } }
}
const body = idx.slice(open + 1, end);
const entries = [...body.matchAll(/^\s*'?([a-z0-9_]+)'?\s*:\s*(\w+)/gm)].map(m => [m[1], m[2]]);
const byImpl = {};
for (const [n, i] of entries) { (byImpl[i] = byImpl[i] || []).push(n); }
const primarios = [], aliases = [];
for (const [n, i] of entries) {
  if (byImpl[i][0] === n) primarios.push(n);
  else aliases.push(n + '->' + byImpl[i][0]);
}
console.log('=== REGISTRADOS ===');
console.log('Total chaves:', entries.length);
console.log('Primarios:', primarios.length);
console.log('Aliases internos:', aliases.length, aliases.join(', '));

// 2. loadCommands adiciona aliases dinamicos
const dyn = [];
if (idx.includes("commandsMap.set('screenshare'")) dyn.push('screenshare->screen');
if (idx.includes("commandsMap.set('share'")) dyn.push('share->screen');
console.log('Dinamicos:', dyn.join(', '));

// 3. Comandos citados no menu/help/jogos
function cited(file) {
  const s = fs.readFileSync(file, 'utf8');
  return [...new Set([...s.matchAll(/\$([a-z0-9_]+)/gi)].map(m => m[1].toLowerCase()))];
}
const menu = cited('src/bot/commands/menu.ts');
const help = cited('src/bot/commands/help.ts');
const jogos = cited('src/bot/commands/jogos.ts');
const regSet = new Set(entries.map(e => e[0]));
console.log('');
console.log('=== MENU cita', menu.length, '===');
console.log('Faltando:', menu.filter(c => !regSet.has(c)).join(', ') || '(nenhum)');
console.log('');
console.log('=== HELP cita', help.length, '===');
console.log('Faltando:', help.filter(c => !regSet.has(c)).join(', ') || '(nenhum)');
console.log('');
console.log('=== JOGOS cita', jogos.length, '===');
console.log('Faltando:', jogos.filter(c => !regSet.has(c)).join(', ') || '(nenhum)');

// 4. Listas
console.log('');
console.log('=== LISTAS ===');
const listaCmds = ['lista1','lista2','lista3','lista1add','lista2add','lista3add','lista1edit','lista2edit','lista3edit','lista1del','lista2del','lista3del'];
for (const c of listaCmds) {
  const inReg = regSet.has(c);
  const inMenu = menu.includes(c);
  const inHelp = help.includes(c);
  const fileExists = fs.existsSync('src/bot/commands/' + c + '.ts');
  console.log(c + ': registrado=' + inReg + ' menu=' + inMenu + ' help=' + inHelp + ' arquivo=' + fileExists);
}

// 5. Documentacao cita?
console.log('');
console.log('=== DOCS citam listas? ===');
for (const f of ['README.md', 'docs/TECHNICAL.md', 'docs/AI_CONTEXT.md', 'docs/TESTING.md', 'docs/ROADMAP.md', 'docs/KNOWN_ISSUES.md', 'docs/DECISIONS.md', 'CHANGELOG.md']) {
  if (!fs.existsSync(f)) continue;
  const s = fs.readFileSync(f, 'utf8');
  const found = listaCmds.filter(c => s.includes('$' + c));
  if (found.length) console.log(f + ': ' + found.join(', '));
}
console.log('(vazio = nenhum doc cita listas)');

// 6. Arquivos de lista em qualquer lugar
console.log('');
console.log('=== arquivos lista*.ts em src/ ===');
const { execSync } = require('child_process');
try {
  const out = execSync('find src -name "lista*" 2>/dev/null').toString().trim();
  console.log(out || '(nenhum)');
} catch { console.log('(nenhum)'); }
