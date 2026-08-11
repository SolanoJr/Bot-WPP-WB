// Atalho para o relay compilado (gerado por `npm run build:relay` -> dist/relay/server.js).
// O Render usa Start Command `node relay/server.js`; este arquivo redireciona ao dist.
try {
  module.exports = require('../dist/relay/server.js');
} catch (e) {
  console.error('[relay] dist/relay/server.js ausente. Rode `npm run build` antes de startar.', e);
  process.exit(1);
}
