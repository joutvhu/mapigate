import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

const ACCOUNT_HOST = "account.xiaomi.com";
const SSO_UA = "MiClaw/1.0";

const SID_BY_REGION: Record<string, string> = {
  cn: "mimopc",
  sgp: "mimosgp",
  ams: "mimoams",
  ru: "mimoru",
  in: "mimoin",
};

export function sidForRegion(region?: string): string {
  const r = String(region || "").toLowerCase();
  return SID_BY_REGION[r] || SID_BY_REGION.sgp;
}

function desktopCookiePath(): string {
  const home = os.homedir();
  if (process.platform === "win32") {
    return path.join(home, "AppData", "Roaming", "Xiaomi MiMo", "Partitions", "xiaomi-account", "Network", "Cookies");
  }
  if (process.platform === "darwin") {
    return path.join(home, "Library", "Application Support", "Xiaomi MiMo", "Partitions", "xiaomi-account", "Network", "Cookies");
  }
  return path.join(home, ".config", "Xiaomi MiMo", "Partitions", "xiaomi-account", "Network", "Cookies");
}

export async function readDesktopPassToken(): Promise<{ passToken: string; userId: string | null; cUserId: string | null } | null> {
  const src = desktopCookiePath();
  if (!fs.existsSync(src)) return null;

  const tmp = path.join(os.tmpdir(), `mpg-mimo-cookies-${process.pid}-${crypto.randomBytes(4).toString("hex")}.db`);
  try {
    fs.copyFileSync(src, tmp);
  } catch {
    return null;
  }

  try {
    const sqlite = await import("node:sqlite" as any);
    const DatabaseSync = (sqlite as any).DatabaseSync;
    if (!DatabaseSync) return null;
    const db = new DatabaseSync(tmp, { readOnly: true });
    const rows = db.prepare("SELECT name, value FROM cookies WHERE host_key = ?").all("." + ACCOUNT_HOST) as any[];
    db.close();
    const jar = Object.fromEntries(rows.map((r: any) => [r.name, r.value]));
    if (!jar.passToken) return null;
    return { passToken: jar.passToken, userId: jar.userId || null, cUserId: jar.cUserId || null };
  } catch {
    return null;
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch {}
  }
}

function signatureClientSign(nonce: string, ssecurity: string): string {
  const input = `nonce=${nonce}` + (ssecurity && ssecurity.trim() ? `&${ssecurity}` : "");
  return encodeURIComponent(crypto.createHash("sha1").update(input).digest("base64"));
}

export async function acquireMimoServiceToken(
  passJar: { passToken: string; userId?: string | null; cUserId?: string | null },
  region: string = "sgp"
): Promise<string | null> {
  const sid = sidForRegion(region);
  const p1Jar: string[] = [];
  if (passJar.userId) p1Jar.push(`userId=${passJar.userId}`);
  if (passJar.passToken) p1Jar.push(`passToken=${passJar.passToken}`);
  if (passJar.cUserId) p1Jar.push(`cUserId=${passJar.cUserId}`);

  const p1Url = `https://${ACCOUNT_HOST}/pass/serviceLogin?_locale=zh_CN&_snsNone=true&sid=${encodeURIComponent(sid)}&_json=true`;
  const p1Res = await fetch(p1Url, {
    headers: { Cookie: p1Jar.join("; "), "User-Agent": SSO_UA, Accept: "application/json" },
  });

  const raw = await p1Res.text();
  const clean = raw.replace(/^&&&START&&&/, "");
  let j: any = null;
  try {
    j = JSON.parse(clean);
  } catch {
    return null;
  }

  if (!j || j.code !== 0 || !j.location || !j.nonce || !j.ssecurity) {
    return null;
  }

  const sep = j.location.includes("?") ? "&" : "?";
  let current = `${j.location}${sep}clientSign=${signatureClientSign(String(j.nonce), j.ssecurity)}`;
  let serviceToken: string | null = null;

  for (let hop = 0; hop < 8; hop++) {
    const res = await fetch(current, {
      redirect: "manual",
      headers: { "User-Agent": SSO_UA },
    });

    const setCookies = res.headers.getSetCookie?.() || [];
    for (const sc of setCookies) {
      const match = /^([^=]+)=([^;]*)/.exec(sc.trim());
      if (match && (match[1] === "serviceToken" || match[1] === `${sid}_serviceToken`)) {
        serviceToken = match[2];
      }
    }

    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) {
      current = new URL(loc, current).toString();
      continue;
    }
    break;
  }

  return serviceToken;
}
