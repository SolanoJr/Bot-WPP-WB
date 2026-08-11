// Atalho para o relay compilado. Cobre o Start Command `node src/relay/server.js` do Render.
try {
  module.exports = require('../../dist/relay/server.js');
} catch (e) {
  console.error('[relay] dist/relay/server.js ausente. Rode `npm run build` antes de startar.', e);
  process.exit(1);
}
