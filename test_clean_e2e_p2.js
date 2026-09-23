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
