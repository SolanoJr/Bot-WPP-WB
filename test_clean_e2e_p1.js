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
