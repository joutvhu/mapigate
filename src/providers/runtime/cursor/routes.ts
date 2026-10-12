import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import type { Router } from "express";
import { ProviderRepository } from "../../../storage/repositories/providerRepo.js";
import { OAuthHandlerRegistry } from "../../core/oauthRegistry.js";
import type { ProviderOAuthHandler, IdeAutoImportResult } from "../../core/oauthTypes.js";

export function getCursorCandidatePaths(): string[] {
  const home = os.homedir();
  const platform = process.platform;

  if (platform === "darwin") {
    return [
      path.join(home, "Library", "Application Support", "Cursor", "User", "globalStorage", "state.vscdb"),
      path.join(home, "Library", "Application Support", "Cursor - Insiders", "User", "globalStorage", "state.vscdb"),
    ];
  }

  if (platform === "win32") {
    const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");
    const localAppData = process.env.LOCALAPPDATA || path.join(home, "AppData", "Local");
    return [
      path.join(appData, "Cursor", "User", "globalStorage", "state.vscdb"),
      path.join(appData, "Cursor - Insiders", "User", "globalStorage", "state.vscdb"),
      path.join(localAppData, "Cursor", "User", "globalStorage", "state.vscdb"),
      path.join(localAppData, "Programs", "Cursor", "User", "globalStorage", "state.vscdb"),
    ];
  }

  return [
    path.join(home, ".config", "Cursor", "User", "globalStorage", "state.vscdb"),
    path.join(home, ".config", "cursor", "User", "globalStorage", "state.vscdb"),
  ];
}

export function extractCursorTokens(dbPath: string): { accessToken: string | null; machineId: string | null } {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const query = (key: string): string | null => {
      try {
        const stmt = db.prepare("SELECT value FROM itemTable WHERE key = ? LIMIT 1");
        const row = stmt.get(key) as any;
        return row?.value || null;
      } catch {
        return null;
      }
    };

    const normalize = (val: any): string | null => {
      if (typeof val !== "string") return null;
      try {
        const p = JSON.parse(val);
        return typeof p === "string" ? p : val;
      } catch {
        return val;
      }
    };

    let accessToken: string | null = null;
    for (const k of ["cursorAuth/accessToken", "cursorAuth/token"]) {
      const r = query(k);
      if (r) {
        accessToken = normalize(r);
        if (accessToken) break;
      }
    }

    let machineId: string | null = null;
    for (const k of ["storage.serviceMachineId", "storage.machineId", "telemetry.machineId"]) {
      const r = query(k);
      if (r) {
        machineId = normalize(r);
        if (machineId) break;
      }
    }

    return { accessToken, machineId };
  } finally {
    try {
      db.close();
    } catch {}
  }
}

export async function autoImport(): Promise<IdeAutoImportResult> {
  const candidatePaths = getCursorCandidatePaths();
  let foundDbPath: string | null = null;

  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      foundDbPath = p;
      break;
    }
  }

  if (!foundDbPath) {
    return {
      found: false,
      error: "Cursor database state.vscdb not found. Ensure Cursor IDE is installed and logged in.",
    };
  }

  try {
    const tokens = extractCursorTokens(foundDbPath);
    if (!tokens.accessToken) {
      return {
        found: false,
        error: "Cursor session token not found in state.vscdb. Please log into Cursor IDE.",
      };
    }

    return {
      found: true,
      accessToken: tokens.accessToken,
      machineId: tokens.machineId || "desktop-cursor-client",
    };
  } catch (err: any) {
    return {
      found: false,
      error: err.message || "Could not read Cursor IDE database",
    };
  }
}

export async function importAccount(params: {
  accessToken: string;
  machineId?: string;
  name?: string;
}): Promise<{ success: boolean; id?: string; name?: string; error?: string }> {
  if (!params.accessToken) {
    return { success: false, error: "Access token is required" };
  }

  ProviderRepository.ensureProviderExists("cursor");
  const accountId = `acc_${crypto.randomUUID().slice(0, 8)}`;
  const accountName = params.name || "Cursor Desktop Account";

  ProviderRepository.addAccount({
    id: accountId,
    providerId: "cursor",
    name: accountName,
    rawApiKey: params.accessToken,
    providerSpecificData: {
      accessToken: params.accessToken,
      machineId: params.machineId || "desktop-cursor-client",
    },
  });

  return { success: true, id: accountId, name: accountName };
}

export const cursorOAuthHandler: ProviderOAuthHandler = {
  id: "cursor",
  autoImport,
  importAccount,
};

export function registerRoutes(router: Router): void {
  OAuthHandlerRegistry.register("cursor", cursorOAuthHandler);

  router.get("/cursor/auto-import", async (_req, res) => {
    try {
      res.json(await cursorOAuthHandler.autoImport!());
    } catch (err: any) {
      res.json({ found: false, error: err.message || "Could not read Cursor IDE database" });
    }
  });

  router.post("/cursor/import", async (req, res) => {
    const { accessToken, machineId, name } = req.body;
    if (!accessToken) return res.status(400).json({ error: "Access token is required" });
    try {
      const result = await cursorOAuthHandler.importAccount!({ accessToken, machineId, name });
      if (!result.success) return res.status(400).json({ error: result.error || "Failed to import Cursor account" });
      res.json({ success: true, id: result.id, name: result.name });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to import Cursor account" });
    }
  });
}
