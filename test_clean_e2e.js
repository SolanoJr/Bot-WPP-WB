const { performance } = require("perf_hooks");
const { makeWASocket, useMultiFileAuthState } = require("@whiskeysockets/baileys");
const fs = require("fs");
const path = require("path");
const phone = "558581344211";
const tmpDir = "/tmp/baileys-pairing-clean-" + Date.now();
const logPath = path.join(tmpDir, "log.json");
function log(entry) {
  const fd = fs.openSync(logPath, "a");
  fs.writeSync(fd, JSON.stringify(entry) + "\n");
  fs.closeSync(fd);
  if (entry.type === "fatalError" || entry.type === "end") process.stdout.write(JSON.stringify(entry) + "\n");
}
let ctx = { t0: 0, driver: null, connState: undefined, wsOpen: false, wsRS: undefined, lastDisc: null, credsUpd: 0, qr: null, rpcEntered: false, rpcResult: null, rpcErr: null };
async function main() {
  ctx.t0 = performance.now();
  fs.mkdirSync(tmpDir, { recursive: true });
  log({ t: 0, type: "start", dir: tmpDir });
  const before = fs.readdirSync(tmpDir);
  log({ t: performance.now() - ctx.t0, type: "filesBefore", count: before.length, files: before });
  if (before.length !== 1 || before[0] !== "log.json") throw new Error("Not empty");
  const { state: authState } = await useMultiFileAuthState(tmpDir);
  log({ t: performance.now() - ctx.t0, type: "authState", hasCreds: !!(authState?.creds?.me?.id || authState?.creds?.registered) });
  const driver = makeWASocket({ auth: authState, authDir: tmpDir });
  ctx.driver = driver;
  log({ t: performance.now() - ctx.t0, type: "socketCreated" });
  const ws = driver.ws;
  log({ t: performance.now() - ctx.t0, type: "socketState", wsOpen: ws?.isOpen, wsReadyState: ws?.readyState });
  driver.ev.on("connection.update", (u) => {
    const cd = u.lastDisconnect ? { err: u.lastDisconnect.error?.message || String(u.lastDisconnect.error), code: u.lastDisconnect.error?.output?.statusCode || u.lastDisconnect.error?.statusCode || 0 } : null;
    ctx.connState = u.connection;
    ctx.wsOpen = driver.ws?.isOpen;
    ctx.wsRS = driver.ws?.readyState;
    ctx.lastDisc = cd;
    log({ t: performance.now() - ctx.t0, type: "connUpdate", conn: u.connection, wsOpen: ctx.wsOpen, wsRS: ctx.wsRS, lastDisc: cd });
  });
  driver.ev.on("creds.update", () => { ctx.credsUpd++; log({ t: performance.now() - ctx.t0, type: "credsUpdate", n: ctx.credsUpd }); });
  driver.ev.on("qr", (qr) => { ctx.qr = qr; log({ t: performance.now() - ctx.t0, type: "qrPresent", has: !!qr }); });
  driver.ev.on("disconnected", (r) => log({ t: performance.now() - ctx.t0, type: "disconnected", reason: String(r) }));
  driver.ev.on("error", (e) => log({ t: performance.now() - ctx.t0, type: "socketError", err: e?.message || String(e) }));
  log({ t: performance.now() - ctx.t0, type: "waitStart", timeoutMs: 120000 });
  await driver.waitForConnectionUpdate(async (u) => u.connection === "open" || u.connection === "close", 120000);
  log({ t: performance.now() - ctx.t0, type: "waitDone", conn: ctx.connState, wsOpen: ctx.wsOpen, wsRS: ctx.wsRS });
  if (!driver || !driver.ws || !driver.ws.isOpen) { log({ t: performance.now() - ctx.t0, type: "abort", reason: "!ws.isOpen" }); log({ t: performance.now() - ctx.t0, type: "end", dir: tmpDir }); return; }
  log({ t: performance.now() - ctx.t0, type: "rpcEnter" });
  try {
    const code = await driver.requestPairingCode(phone);
    log({ t: performance.now() - ctx.t0, type: "rpcReturn", code: String(code), type: typeof code });
  } catch (e) { log({ t: performance.now() - ctx.t0, type: "rpcError", err: e?.message || String(e) }); }
  log({ t: performance.now() - ctx.t0, type: "monitorStart" });
  await new Promise(r => setTimeout(r, 30000));
  log({ t: performance.now() - ctx.t0, type: "monitorEnd", conn: ctx.connState, wsOpen: ctx.wsOpen, wsRS: ctx.wsRS, lastDisc: ctx.lastDisc, credsUpd: ctx.credsUpd, qrPresent: !!ctx.qr });
  log({ t: performance.now() - ctx.t0, type: "end", dir: tmpDir });
  process.exit(0);
}
main().catch(err => { log({ t: performance.now() - ctx.t0, type: "fatal", err: err?.message || String(err), stack: err?.stack }); log({ t: performance.now() - ctx.t0, type: "end", dir: tmpDir }); process.exit(1); });
