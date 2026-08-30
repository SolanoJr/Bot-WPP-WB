import crypto from "node:crypto";

let cached = null;

function secret() {
  if (cached) return cached;
  cached = process.env.SESSION_SECRET;
  if (!cached) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SESSION_SECRET nao definido");
    }
    cached = "dev-secret-change-in-production";
  }
  return cached;
}

function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(str) {
  const pad = str.length % 4;
  const s = pad ? str + "=".repeat(4 - pad) : str;
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

export function signToken(payload, ttlSeconds = 3600) {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + ttlSeconds;

  // Determina o role/scope: prefere scope, depois role, depois viewer
  const role = payload.scope || payload.role || "viewer";
  const room = payload.room || (payload.instance || "web");

  const data = [room, payload.uid || "", payload.name || "", role, String(exp)].join(".");
  const sig = b64url(crypto.createHmac("sha256", secret()).update(data).digest());

  return data + "." + sig;
}

export function verifyToken(token) {
  if (!token || typeof token !== "string") return null;

  // JWT legacy (3 partes, começa com eyJ)
  if (token.startsWith("eyJ") && token.split(".").length === 3) {
    try {
      const parts = token.split(".");
      const payload = JSON.parse(b64urlDecode(parts[1]).toString());
      const sig = b64url(crypto.createHmac("sha256", secret()).update(parts[0] + "." + parts[1]).digest());
      if (sig !== parts[2]) return null;
      if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
      return { ...payload, scope: payload.scope || payload.role || "viewer" };
    } catch {
      return null;
    }
  }

  // Compacto: room.uid.name.role.exp.sig (6 partes)
  const parts = token.split(".");
  if (parts.length !== 6) return null;

  const [room, uid, name, role, expStr, sig] = parts;
  const exp = parseInt(expStr, 10);
  if (!exp || exp < Math.floor(Date.now() / 1000)) return null;

  const data = [room, uid, name, role, expStr].join(".");
  const expectedSig = b64url(crypto.createHmac("sha256", secret()).update(data).digest());
  if (sig !== expectedSig) return null;

  return { room, uid, name, role, exp, scope: role };
}

export function shortToken(room, uid, name, role = "viewer", ttlSeconds = 3600) {
  return signToken({ room, uid, name, role }, ttlSeconds);
}