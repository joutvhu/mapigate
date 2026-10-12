import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import type { Router } from "express";
import { ProviderRepository } from "../../../storage/repositories/providerRepo.js";
import { OAuthHandlerRegistry } from "../../core/oauthRegistry.js";
import type { ProviderOAuthHandler, IdeAutoImportResult } from "../../core/oauthTypes.js";

export function scanAwsSsoCache(): IdeAutoImportResult {
  const cachePath = path.join(os.homedir(), ".aws", "sso", "cache");
  if (!fs.existsSync(cachePath)) {
    return {
      found: false,
      error: "AWS SSO cache not found at ~/.aws/sso/cache. Please sign into Kiro IDE first.",
    };
  }

  try {
    const files = fs.readdirSync(cachePath);
    let refreshToken: string | null = null;
    let tokenData: any = null;

    const directFile = path.join(cachePath, "kiro-auth-token.json");
    if (fs.existsSync(directFile)) {
      try {
        const content = fs.readFileSync(directFile, "utf-8");
        const parsed = JSON.parse(content);
        if (parsed.refreshToken && parsed.refreshToken.startsWith("aorAAAAAG")) {
          refreshToken = parsed.refreshToken;
          tokenData = parsed;
        }
      } catch {}
    }

    if (!refreshToken) {
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        try {
          const content = fs.readFileSync(path.join(cachePath, file), "utf-8");
          const parsed = JSON.parse(content);
          if (parsed.refreshToken && parsed.refreshToken.startsWith("aorAAAAAG")) {
            refreshToken = parsed.refreshToken;
            tokenData = parsed;
            break;
          }
        } catch {}
      }
    }

    if (!refreshToken) {
      return {
        found: false,
        error: "Kiro token starting with 'aorAAAAAG' not found in ~/.aws/sso/cache.",
      };
    }

    let clientId: string | null = null;
    let clientSecret: string | null = null;
    if (tokenData?.clientIdHash) {
      const clientFile = path.join(cachePath, `${tokenData.clientIdHash}.json`);
      if (fs.existsSync(clientFile)) {
        try {
          const cContent = fs.readFileSync(clientFile, "utf-8");
          const cParsed = JSON.parse(cContent);
          clientId = cParsed.clientId || null;
          clientSecret = cParsed.clientSecret || null;
        } catch {}
      }
    }

    let profileArn: string | null = null;
    const profilePaths = [
      path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "Kiro", "User", "globalStorage", "kiro.kiroagent", "profile.json"),
      path.join(os.homedir(), ".config", "Kiro", "User", "globalStorage", "kiro.kiroagent", "profile.json"),
    ];
    for (const pp of profilePaths) {
      if (fs.existsSync(pp)) {
        try {
          const prContent = fs.readFileSync(pp, "utf-8");
          const prParsed = JSON.parse(prContent);
          if (prParsed.profileArn) {
            profileArn = prParsed.profileArn;
            break;
          }
        } catch {}
      }
    }

    return {
      found: true,
      refreshToken,
      clientId,
      clientSecret,
      region: tokenData?.region || "us-east-1",
      authMethod: tokenData?.authMethod || (clientId ? "idc" : "builder-id"),
      profileArn,
    };
  } catch (err: any) {
    return {
      found: false,
      error: err.message || "Failed to scan AWS SSO cache",
    };
  }
}

export function autoImport(): IdeAutoImportResult {
  return scanAwsSsoCache();
}

export function importAccount(params: {
  refreshToken: string;
  clientId?: string | null;
  clientSecret?: string | null;
  region?: string;
  authMethod?: string;
  profileArn?: string | null;
  name?: string;
}): { success: boolean; id?: string; name?: string; error?: string } {
  if (!params.refreshToken) {
    return { success: false, error: "Refresh token is required" };
  }

  ProviderRepository.ensureProviderExists("kiro");
  const accountId = `acc_${crypto.randomUUID().slice(0, 8)}`;
  const accountName = params.name || (params.clientId ? "Kiro Enterprise (IDC)" : "Kiro AWS Builder ID");

  ProviderRepository.addAccount({
    id: accountId,
    providerId: "kiro",
    name: accountName,
    rawApiKey: params.refreshToken,
    providerSpecificData: {
      refreshToken: params.refreshToken,
      clientId: params.clientId || null,
      clientSecret: params.clientSecret || null,
      region: params.region || "us-east-1",
      authMethod: params.authMethod || (params.clientId ? "idc" : "builder-id"),
      profileArn: params.profileArn || null,
    },
  });

  return { success: true, id: accountId, name: accountName };
}

export function importApiKey(params: {
  apiKey: string;
  region?: string;
  name?: string;
}): { success: boolean; id?: string; name?: string; error?: string } {
  if (!params.apiKey) {
    return { success: false, error: "API key is required" };
  }

  ProviderRepository.ensureProviderExists("kiro");
  const accountId = `acc_${crypto.randomUUID().slice(0, 8)}`;
  const accountName = params.name || "Kiro Headless API Key";

  ProviderRepository.addAccount({
    id: accountId,
    providerId: "kiro",
    name: accountName,
    rawApiKey: params.apiKey,
    providerSpecificData: {
      region: params.region || "us-east-1",
      authMethod: "api-key",
    },
  });

  return { success: true, id: accountId, name: accountName };
}

export const kiroOAuthHandler: ProviderOAuthHandler = {
  id: "kiro",
  autoImport,
  importAccount,
  importApiKey,
};

export function registerRoutes(router: Router): void {
  OAuthHandlerRegistry.register("kiro", kiroOAuthHandler);

  router.get("/kiro/auto-import", async (_req, res) => {
    try {
      res.json(await kiroOAuthHandler.autoImport!());
    } catch (err: any) {
      res.json({ found: false, error: err.message || "Failed to scan AWS SSO cache" });
    }
  });

  router.post("/kiro/import", async (req, res) => {
    const { refreshToken, clientId, clientSecret, region, authMethod, profileArn, name } = req.body;
    if (!refreshToken) return res.status(400).json({ error: "Refresh token is required" });
    try {
      const result = await kiroOAuthHandler.importAccount!({
        refreshToken,
        clientId,
        clientSecret,
        region,
        authMethod,
        profileArn,
        name,
      });
      if (!result.success) return res.status(400).json({ error: result.error || "Failed to import Kiro account" });
      res.json({ success: true, id: result.id, name: result.name });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to import Kiro account" });
    }
  });

  router.post("/kiro/api-key", async (req, res) => {
    const { apiKey, region, name } = req.body;
    if (!apiKey) return res.status(400).json({ error: "API key is required" });
    try {
      const result = await kiroOAuthHandler.importApiKey!({ apiKey, region, name });
      if (!result.success) return res.status(400).json({ error: result.error || "Failed to import Kiro API key" });
      res.json({ success: true, id: result.id, name: result.name });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to import Kiro API key" });
    }
  });
}
