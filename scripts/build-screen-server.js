const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const srcDir = path.join(__dirname, '..', 'src', 'services', 'discord-screen');
const distDir = path.join(__dirname, '..', 'dist', 'services', 'discord-screen');

// Criar diretório de destino
fs.mkdirSync(distDir, { recursive: true });

// Copiar arquivos JS do servidor
const serverFiles = fs.readdirSync(srcDir).filter(f => f.endsWith('.js'));
for (const file of serverFiles) {
  fs.copyFileSync(path.join(srcDir, file), path.join(distDir, file));
  console.log(`  ✓ ${file}`);
}

// Copiar pasta public/
const publicSrc = path.join(srcDir, 'public');
const publicDist = path.join(distDir, 'public');
if (fs.existsSync(publicSrc)) {
  fs.mkdirSync(publicDist, { recursive: true });
  const publicFiles = fs.readdirSync(publicSrc);
  for (const file of publicFiles) {
    fs.copyFileSync(path.join(publicSrc, file), path.join(publicDist, file));
  }
  console.log(`  ✓ public/ (${publicFiles.length} arquivos)`);
}

// Copiar pasta client/dist/
const clientDistSrc = path.join(srcDir, 'client', 'dist');
const clientDistDist = path.join(distDir, 'client', 'dist');
if (fs.existsSync(clientDistSrc)) {
  fs.mkdirSync(clientDistDist, { recursive: true });
  const clientFiles = fs.readdirSync(clientDistSrc, { recursive: true });
  for (const file of clientFiles) {
    const srcPath = path.join(clientDistSrc, file);
    const distPath = path.join(clientDistDist, file);
    if (fs.statSync(srcPath).isFile()) {
      fs.mkdirSync(path.dirname(distPath), { recursive: true });
      fs.copyFileSync(srcPath, distPath);
    }
  }
  console.log(`  ✓ client/dist/`);
}

// Copiar pasta shared/ para dist/services/shared/
const sharedSrc = path.join(srcDir, 'shared');
const sharedDist = path.join(__dirname, '..', 'dist', 'services', 'shared');
if (fs.existsSync(sharedSrc)) {
  fs.mkdirSync(sharedDist, { recursive: true });
  const sharedFiles = fs.readdirSync(sharedSrc);
  for (const file of sharedFiles) {
    const srcPath = path.join(sharedSrc, file);
    if (fs.statSync(srcPath).isFile() && file !== 'broadcaster.js') {
      fs.copyFileSync(srcPath, path.join(sharedDist, file));
    }
  }
  console.log(`  ✓ shared/ (${sharedFiles.length} arquivos)`);
}

// Copiar broadcaster.js completo de src/services/shared/ (sobrescreve o simplificado)
const fullBroadcasterSrc = path.join(__dirname, '..', 'src', 'services', 'shared', 'broadcaster.js');
if (fs.existsSync(fullBroadcasterSrc)) {
  fs.mkdirSync(sharedDist, { recursive: true });
  fs.copyFileSync(fullBroadcasterSrc, path.join(sharedDist, 'broadcaster.js'));
  console.log(`  ✓ broadcaster.js (completo)`);
}

// Copiar package.json do screen server
const pkgSrc = path.join(srcDir, 'package.json');
const pkgDist = path.join(distDir, 'package.json');
if (fs.existsSync(pkgSrc)) {
  fs.copyFileSync(pkgSrc, pkgDist);
  console.log(`  ✓ package.json`);
}

console.log('\n✅ Screen server build completo!');