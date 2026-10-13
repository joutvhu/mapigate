import crypto from "node:crypto";

export const QODER_RSA_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDA8iMH5c02LilrsERw9t6Pv5Nc
4k6Pz1EaDicBMpdpxKduSZu5OANqUq8er4GM95omAGIOPOh+Nx0spthYA2BqGz+l
6HRkPJ7S236FZz73In/KVuLnwI8JJ2CbuJap8kvheCCZpmAWpb/cPx/3Vr/J6I17
XcW+ML9FoCI6AOvOzwIDAQAB
-----END PUBLIC KEY-----`;

const QODER_STD_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const QODER_CUSTOM_ALPHABET = "_doRTgHZBKcGVjlvpC,@aFSx#DPuNJme&i*MzLOEn)sUrthbf%Y^w.(kIQyXqWA!";

const QODER_S2C = (() => {
  const table = new Int16Array(128).fill(-1);
  for (let i = 0; i < 64; i++) {
    table[QODER_STD_ALPHABET.charCodeAt(i)] = QODER_CUSTOM_ALPHABET.charCodeAt(i);
  }
  table["=".charCodeAt(0)] = "$".charCodeAt(0);
  return table;
})();

export function qoderEncodeBody(plaintext: string | Buffer): string {
  const buf = Buffer.isBuffer(plaintext) ? plaintext : Buffer.from(plaintext, "utf8");
  const std = buf.toString("base64");
  const n = std.length;
  const a = Math.floor(n / 3);
  const rearranged = std.slice(n - a) + std.slice(a, n - a) + std.slice(0, a);

  const out = Buffer.alloc(n);
  for (let i = 0; i < n; i++) {
    const c = rearranged.charCodeAt(i);
    out[i] = c < 128 && QODER_S2C[c] >= 0 ? QODER_S2C[c] : c;
  }
  return out.toString("latin1");
}

function pkcs7Pad(data: Buffer, blockSize = 16): Buffer {
  const padding = blockSize - (data.length % blockSize);
  const padded = Buffer.alloc(data.length + padding, padding);
  data.copy(padded, 0);
  return padded;
}

export function buildCosyHeaders(
  bodyBytes: Buffer,
  requestUrl: string,
  creds: { userId: string; authToken: string; machineId?: string }
): Record<string, string> {
  const aesKey = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  const userInfo = JSON.stringify({ userId: creds.userId, user_id: creds.userId });

  const keyBytes = Buffer.from(aesKey, "utf8");
  const cipher = crypto.createCipheriv("aes-128-cbc", keyBytes, keyBytes);
  cipher.setAutoPadding(false);
  const padded = pkcs7Pad(Buffer.from(userInfo, "utf8"), 16);
  const infoB64 = Buffer.concat([cipher.update(padded), cipher.final()]).toString("base64");

  const cosyKeyB64 = crypto
    .publicEncrypt(
      { key: QODER_RSA_PUBLIC_KEY, padding: crypto.constants.RSA_PKCS1_PADDING },
      Buffer.from(aesKey, "utf8")
    )
    .toString("base64");

  const timestamp = String(Date.now());
  const bodyMd5 = crypto.createHash("md5").update(bodyBytes).digest("hex");
  let sigPath = "";
  try {
    const u = new URL(requestUrl);
    sigPath = u.pathname.startsWith("/algo") ? u.pathname.slice(5) : u.pathname;
  } catch {}

  const sigInput = `${infoB64}${cosyKeyB64}${timestamp}${bodyMd5}${sigPath}`;
  const sig = crypto.createHash("md5").update(sigInput).digest("hex");

  return {
    Authorization: `Bearer ${creds.authToken}`,
    "Cosy-Key": cosyKeyB64,
    "Cosy-Info": infoB64,
    "Cosy-Sign": sig,
    "Cosy-Time": timestamp,
    "Cosy-Machineid": creds.machineId || crypto.randomUUID(),
    "Cosy-Ideversion": "0.9.0",
    "Cosy-Clienttype": "cli",
    "Cosy-Machineos": process.platform === "win32" ? "windows" : process.platform === "darwin" ? "darwin" : "linux",
  };
}
