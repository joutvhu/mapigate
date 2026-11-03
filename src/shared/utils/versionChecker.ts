import https from "node:https";
import { APP_VERSION } from "../constants/version.js";

export interface VersionCheckResult {
  currentVersion: string;
  latestVersion: string | null;
  hasUpdate: boolean;
  checkedAt: number;
}

const NPM_PACKAGE_NAME = "mapigate";
const VERSION_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour TTL

let cachedResult: VersionCheckResult | null = null;

/**
 * Compare two semver strings a and b (format X.Y.Z)
 * Returns 1 if a > b, -1 if a < b, 0 if equal
 */
export function compareVersions(a: string, b: string): number {
  const cleanA = a.replace(/^v/, "").trim();
  const cleanB = b.replace(/^v/, "").trim();

  const pa = cleanA.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = cleanB.split(".").map((n) => parseInt(n, 10) || 0);

  for (let i = 0; i < Math.max(pa.length, pb.length, 3); i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

/**
 * Fetch latest version of package from npm registry via native HTTPS
 */
export function fetchLatestNpmVersion(packageName: string = NPM_PACKAGE_NAME, timeoutMs: number = 4000): Promise<string | null> {
  return new Promise((resolve) => {
    const req = https.get(
      `https://registry.npmjs.org/${packageName}/latest`,
      {
        timeout: timeoutMs,
        headers: {
          "User-Agent": `mapigate/${APP_VERSION}`,
          Accept: "application/json",
        },
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          res.resume();
          return resolve(null);
        }
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            resolve(typeof parsed.version === "string" ? parsed.version : null);
          } catch {
            resolve(null);
          }
        });
      }
    );

    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
  });
}

/**
 * Check for updates with in-memory caching
 */
export async function checkForUpdates(forceRefresh: boolean = false): Promise<VersionCheckResult> {
  const now = Date.now();
  if (!forceRefresh && cachedResult && now - cachedResult.checkedAt < VERSION_CACHE_TTL_MS) {
    return cachedResult;
  }

  const latest = await fetchLatestNpmVersion();
  const hasUpdate = latest ? compareVersions(latest, APP_VERSION) > 0 : false;

  cachedResult = {
    currentVersion: APP_VERSION,
    latestVersion: latest,
    hasUpdate,
    checkedAt: now,
  };

  return cachedResult;
}
