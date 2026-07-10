"use strict";
var h = Object.create;
var u = Object.defineProperty;
var I = Object.getOwnPropertyDescriptor;
var f = Object.getOwnPropertyNames;
var v = Object.getPrototypeOf,
  S = Object.prototype.hasOwnProperty;
var A = (o, t, e, s) => {
  if ((t && typeof t == "object") || typeof t == "function")
    for (let n of f(t))
      !S.call(o, n) &&
        n !== e &&
        u(o, n, {
          get: () => t[n],
          enumerable: !(s = I(t, n)) || s.enumerable,
        });
  return o;
};
var d = (o, t, e) => (
  (e = o != null ? h(v(o)) : {}),
  A(
    t || !o || !o.__esModule
      ? u(e, "default", { value: o, enumerable: !0 })
      : e,
    o,
  )
);
var g = d(require("express")),
  y = d(require("cors"));
var l = class {
  locations = [];
  clients = new Map();
  telemetry = [];
  groups = new Map();
  async saveLocation(t) {
    let e = Date.now(),
      s = { ...t, id: e, receivedAt: new Date().toISOString(), processed: !1 };
    return (
      this.locations.push(s),
      this.locations.length > 500 && this.locations.shift(),
      e
    );
  }
  async getPendingLocation(t) {
    return this.locations.find((e) => e.chatId === t && !e.processed) || null;
  }
  async markAsProcessed(t) {
    let e = this.locations.find((s) => s.id === t);
    e && ((e.processed = !0), (e.processedAt = new Date().toISOString()));
  }
  async updateClient(t) {
    let e = this.clients.get(t) || { totalLocations: 0, lastSeen: "" };
    ((e.lastSeen = new Date().toISOString()),
      e.totalLocations++,
      this.clients.set(t, e));
  }
  async saveTelemetry(t) {
    (this.telemetry.push({ ...t, timestamp: new Date().toISOString() }),
      this.telemetry.length > 100 && this.telemetry.shift());
  }
  async getGroupConfig(t) {
    return this.groups.get(t) || null;
  }
  async saveGroupConfig(t, e) {
    let s = this.groups.get(t) || {
        welcomeMessage: null,
        customCommands: null,
        antispamActive: 0,
        isActive: !0,
      },
      n = {
        ...s,
        ...e,
        isActive:
          typeof e.isActive == "boolean"
            ? e.isActive
            : !!(e.isActive ?? s.isActive),
      };
    return (this.groups.set(t, n), n);
  }
  async getStats() {
    return { locations: this.locations.length, clients: this.clients.size };
  }
};
var r = (0, g.default)(),
  m = process.env.PORT || 3e3,
  a = process.env.WARRIOR_AUTH_KEY || "solano_wb_gps_26",
  i = new l(),
  P = [
    "https://bot-wpp-wb-sc.pages.dev",
    "http://localhost:3000",
    "https://bot-wpp-relay.onrender.com",
  ];
r.use((o, t, e) => {
  let s = o.headers.origin;
  if (
    (s && P.includes(s)
      ? t.header("Access-Control-Allow-Origin", s)
      : t.header(
          "Access-Control-Allow-Origin",
          "https://bot-wpp-wb-sc.pages.dev",
        ),
    t.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS"),
    t.header(
      "Access-Control-Allow-Headers",
      "Content-Type, x-api-key, Authorization, Cache-Control, Pragma, Expires",
    ),
    t.header("Access-Control-Allow-Credentials", "true"),
    o.method === "OPTIONS")
  )
    return t.sendStatus(204);
  e();
});
r.use((0, y.default)());
r.use(g.default.json({ limit: "1mb" }));
var c = (o, t, e) => {
  let s = o.headers["x-api-key"],
    n = String(a).trim(),
    p = s ? String(s).trim() : "";
  if (p !== n)
    return (
      console.warn(`\u{1F512} [SECURITY] Acesso negado em ${o.path}`),
      t
        .status(401)
        .json({
          success: !1,
          error: "auth_failed",
          received_len: p.length,
          expected_len: n.length,
        })
    );
  e();
};
r.get("/health", (o, t) => {
  t.json({
    ok: !0,
    service: "warrior-relay-ts",
    timestamp: new Date().toISOString(),
  });
});
r.get("/debug-env-check", async (o, t) => {
  let e = await i.getStats();
  t.json({
    ok: !0,
    len: a.length,
    prefix: a.substring(0, 4),
    storage: e,
    timestamp: new Date().toISOString(),
  });
});
r.post("/location", c, async (o, t) => {
  try {
    let e = o.body,
      s = await i.saveLocation(e);
    (await i.updateClient(e.chatId),
      console.log(
        `\u2705 [RELAY-TS] Localiza\xE7\xE3o armazenada: ${e.chatId}`,
      ),
      t.json({ success: !0, locationId: s }));
  } catch (e) {
    t.status(500).json({ success: !1, error: e.message });
  }
});
r.post("/telemetry", c, async (o, t) => {
  try {
    let e = o.body;
    (await i.saveTelemetry(e),
      console.log(
        `[RELAY-TS] Telemetria recebida: ${e.botNumber || "unknown"}`,
      ),
      t.json({ success: !0, message: "telemetry_saved" }));
  } catch (e) {
    t.status(500).json({ success: !1, error: e.message });
  }
});
r.get("/groups/:groupId/config", c, async (o, t) => {
  try {
    let e = String(o.params.groupId).trim(),
      s = await i.getGroupConfig(e);
    t.json({ success: !0, data: s, ...(s || {}) });
  } catch (e) {
    t.status(500).json({ success: !1, error: e.message });
  }
});
r.post("/groups/:groupId/config", c, async (o, t) => {
  try {
    let e = String(o.params.groupId).trim(),
      s = o.body,
      n = await i.saveGroupConfig(e, {
        ...s,
        isActive: typeof s.isActive == "number" ? s.isActive === 1 : s.isActive,
      });
    (console.log(`[RELAY-TS] Config de grupo salva: ${e}`),
      t.json({ success: !0, data: n, ...n }));
  } catch (e) {
    t.status(500).json({ success: !1, error: e.message });
  }
});
r.get("/pending/:chatId", c, async (o, t) => {
  try {
    let e = String(o.params.chatId).trim(),
      s = await i.getPendingLocation(e);
    if (!s) return t.status(204).send();
    (await i.markAsProcessed(s.id),
      console.log(`\u{1F4E4} [RELAY-TS] Enviando pendente para: ${e}`),
      t.json(s));
  } catch {
    t.status(204).send();
  }
});
r.listen(m, () => {
  (console.log(`\u{1F680} Relay Server (TS) ONLINE na porta ${m}`),
    console.log(
      `\u{1F510} Warrior Key: ${a.substring(0, 4)}... (Len: ${a.length})`,
    ));
});
