/**
 * 🔒 WarriorBlack — Backend de Telemetria (mínimo)
 *
 * Recebe heartbeats do bot e lista instâncias ativas.
 * Endpoints:
 *   POST /heartbeat  { bot, commit, platforms, uptime }
 *   GET  /instances  -> JSON das instâncias vistas
 *   GET  /health     -> { ok: true }
 *
 * Use: PORT=3000 node backend/server.js  (ou pm2)
 */
const express = require('express');
const app = express();
app.use(express.json());

const instances = new Map(); // bot -> { commit, platforms, uptime, lastSeen }

app.get('/health', (_req, res) => res.json({ ok: true }));

app.post('/heartbeat', (req, res) => {
  const { bot, commit, platforms, uptime } = req.body || {};
  if (!bot) return res.status(400).json({ error: 'bot obrigatório' });
  instances.set(bot, {
    commit: commit || 'local',
    platforms: platforms || [],
    uptime: uptime || 0,
    lastSeen: Date.now(),
  });
  console.log(`[HEARTBEAT] recebido de ${bot} commit=${commit} plataformas=[${(platforms||[]).join(', ')}]`);
  res.json({ ok: true });
});

app.get('/instances', (_req, res) => {
  const now = Date.now();
  const list = [];
  for (const [bot, info] of instances.entries()) {
    list.push({
      bot,
      commit: info.commit,
      platforms: info.platforms,
      uptime: info.uptime,
      lastSeen: info.lastSeen,
      lastSeenAgoSec: Math.floor((now - info.lastSeen) / 1000),
    });
  }
  res.json({ count: list.length, instances: list });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🔒 Backend de telemetria rodando na porta ${PORT}`);
});
