import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Router } from "express";
import { OAuthHandlerRegistry } from "../../core/oauthRegistry.js";
import type { ProviderOAuthHandler, IdeAutoImportResult } from "../../core/oauthTypes.js";

export function getCommandCodeCandidatePaths(): string[] {
  const home = os.homedir();
  const paths = [path.join(home, ".commandcode", "auth.json")];
  if (process.platform === "win32") {
    const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");
    paths.push(path.join(appData, "commandcode", "auth.json"));
  }
  return paths;
}

export async function autoImportCommandCode(): Promise<IdeAutoImportResult & {
  apiKey?: string;
  userId?: string | null;
  userName?: string | null;
  keyName?: string | null;
  authenticatedAt?: string | null;
  source?: string;
}> {
  const candidates = getCommandCodeCandidatePaths();
  let authPath: string | null = null;
  for (const candidate of candidates) {
    try {
      await fs.promises.access(candidate, fs.constants.R_OK);
      authPath = candidate;
      break;
    } catch {
      // try next candidate
    }
  }

  if (!authPath) {
    return {
      found: false,
      error: `Command Code auth file not found. Checked:\n${candidates.join("\n")}\n\nRun 'commandcode login' in your terminal first.`,
    };
  }

  let auth: any;
  try {
    const raw = await fs.promises.readFile(authPath, "utf8");
    auth = JSON.parse(raw);
  } catch {
    return {
      found: false,
      error: "auth.json is not valid JSON. Please run 'commandcode login' again.",
    };
  }

  const apiKey = typeof auth?.apiKey === "string" ? auth.apiKey.trim() : "";
  if (!apiKey) {
    return {
      found: false,
      error: "No apiKey found in ~/.commandcode/auth.json. Please run 'commandcode login'.",
    };
  }

  return {
    found: true,
    apiKey,
    userId: auth.userId || null,
    userName: auth.userName || null,
    keyName: auth.keyName || null,
    authenticatedAt: auth.authenticatedAt || null,
    source: authPath,
  };
}

export const commandCodeOAuthHandler: ProviderOAuthHandler = {
  id: "commandcode",
  autoImport: autoImportCommandCode,
};

export function registerRoutes(router: Router): void {
  OAuthHandlerRegistry.register("commandcode", commandCodeOAuthHandler);

  router.get("/commandcode/auto-import", async (_req, res) => {
    try {
      res.json(await autoImportCommandCode());
    } catch (err: any) {
      res.status(500).json({ found: false, error: err?.message || "Command Code auto-import failed" });
    }
  });
}
