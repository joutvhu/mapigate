import crypto from "node:crypto";

const DNS_NAMESPACE_BYTES = Buffer.from("6ba7b8109dad11d180b400c04fd430c8", "hex");

export function generateHashed64Hex(input: string, salt = ""): string {
  return crypto.createHash("sha256").update(input + salt).digest("hex");
}

export function generateSessionId(authToken: string): string {
  const hash = crypto.createHash("sha1").update(DNS_NAMESPACE_BYTES).update(authToken).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50; // Version 5
  hash[8] = (hash[8] & 0x3f) | 0x80; // Variant RFC 4122
  const hex = hash.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export function generateCursorChecksum(machineId: string): string {
  const timestamp = Math.floor(Date.now() / 1000000);

  const byteArray = new Uint8Array([
    (timestamp >> 40) & 0xff,
    (timestamp >> 32) & 0xff,
    (timestamp >> 24) & 0xff,
    (timestamp >> 16) & 0xff,
    (timestamp >> 8) & 0xff,
    timestamp & 0xff,
  ]);

  let t = 165;
  for (let i = 0; i < byteArray.length; i++) {
    byteArray[i] = ((byteArray[i] ^ t) + (i % 256)) & 0xff;
    t = byteArray[i];
  }

  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let encoded = "";

  for (let i = 0; i < byteArray.length; i += 3) {
    const a = byteArray[i];
    const b = i + 1 < byteArray.length ? byteArray[i + 1] : 0;
    const c = i + 2 < byteArray.length ? byteArray[i + 2] : 0;

    encoded += alphabet[a >> 2];
    encoded += alphabet[((a & 3) << 4) | (b >> 4)];

    if (i + 1 < byteArray.length) {
      encoded += alphabet[((b & 15) << 2) | (c >> 6)];
    }
    if (i + 2 < byteArray.length) {
      encoded += alphabet[c & 63];
    }
  }

  return `${encoded}${machineId}`;
}

export function buildCursorHeaders(
  accessToken: string,
  machineId?: string | null,
  ghostMode = true
): Record<string, string> {
  const cleanToken = accessToken.includes("::") ? accessToken.split("::")[1] : accessToken;
  const effectiveMachineId = machineId || generateHashed64Hex(cleanToken, "machineId");
  const sessionId = generateSessionId(cleanToken);
  const clientKey = generateHashed64Hex(cleanToken);
  const checksum = generateCursorChecksum(effectiveMachineId);

  let os = "linux";
  if (process.platform === "win32") os = "windows";
  else if (process.platform === "darwin") os = "macos";

  let arch = "x64";
  if (process.arch === "arm64") arch = "aarch64";

  return {
    authorization: `Bearer ${cleanToken}`,
    "connect-accept-encoding": "gzip",
    "connect-protocol-version": "1",
    "content-type": "application/connect+proto",
    "user-agent": "connect-es/1.6.1",
    "x-amzn-trace-id": `Root=${crypto.randomUUID()}`,
    "x-client-key": clientKey,
    "x-cursor-checksum": checksum,
    "x-cursor-client-version": "3.12.17",
    "x-cursor-client-commit": "0fb762053c34788bb7760d5673f8a6d4c8589d50",
    "x-cursor-client-type": "ide",
    "x-cursor-client-os": os,
    "x-cursor-client-arch": arch,
    "x-cursor-client-device-type": "desktop",
    "x-cursor-config-version": crypto.randomUUID(),
    "x-cursor-timezone": Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    "x-ghost-mode": ghostMode ? "true" : "false",
    "x-request-id": crypto.randomUUID(),
    "x-session-id": sessionId,
  };
}
