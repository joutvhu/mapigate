import { Router } from "express";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { DatabaseSync } from "node:sqlite";
import { ProviderRepository } from "../../storage/repositories/providerRepo.js";

export const oauthRouter = Router();

export const ANTIGRAVITY_CLIENT_ID = "REDACTED_GOOGLE_CLIENT_ID.apps.googleusercontent.com";
export const ANTIGRAVITY_CLIENT_SECRET = "REDACTED_GOOGLE_CLIENT_SECRET";
export const ANTIGRAVITY_SCOPES = [
  "https://www.googleapis.com/auth/cloud-platform",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/cclog",
  "https://www.googleapis.com/auth/experimentsandconfigs",
];

export async function refreshGoogleOAuthToken(
  refreshToken: string
): Promise<{ accessToken: string; refreshToken?: string; expiresIn?: number } | null> {
  if (!refreshToken) return null;
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: ANTIGRAVITY_CLIENT_ID,
        client_secret: ANTIGRAVITY_CLIENT_SECRET,
      }),
    });
    if (!res.ok) {
      console.warn("Google token refresh failed with status:", res.status);
      return null;
    }
    const data: any = await res.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken,
      expiresIn: Number(data.expires_in) || 3600,
    };
  } catch (err) {
    console.warn("Google token refresh network error:", err);
    return null;
  }
}

function buildAntigravityAuthUrl(redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: ANTIGRAVITY_CLIENT_ID,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: ANTIGRAVITY_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

// GET /api/oauth/:provider/authorize - Get authorization URL
oauthRouter.get("/:provider/authorize", (req, res) => {
  const { provider } = req.params;
  const redirectUri = (req.query.redirect_uri as string) || "http://localhost:20127/callback";

  if (provider === "antigravity") {
    const authUrl = buildAntigravityAuthUrl(redirectUri);
    res.json({
      authUrl,
      redirectUri,
      flowType: "authorization_code",
    });
    return;
  }

  res.status(400).json({ error: `Provider '${provider}' does not support OAuth authorize endpoint` });
});

// POST /api/oauth/:provider/exchange - Exchange authorization code for tokens and save account
oauthRouter.post("/:provider/exchange", async (req, res) => {
  const { provider } = req.params;
  const { code, redirectUri } = req.body;

  if (!code || typeof code !== "string") {
    res.status(400).json({ error: "Missing authorization code or callback URL" });
    return;
  }

  // Extract clean code if full callback URL was pasted
  let rawCode = code.trim();
  if (rawCode.includes("code=")) {
    try {
      const url = new URL(rawCode.startsWith("http") ? rawCode : `http://localhost/${rawCode}`);
      rawCode = url.searchParams.get("code") || rawCode;
    } catch {
      const match = rawCode.match(/[?&]code=([^&]+)/);
      if (match) rawCode = decodeURIComponent(match[1]);
    }
  }

  const effectiveRedirectUri = redirectUri || "http://localhost:20127/callback";

  if (provider === "antigravity") {
    try {
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: ANTIGRAVITY_CLIENT_ID,
          client_secret: ANTIGRAVITY_CLIENT_SECRET,
          code: rawCode,
          redirect_uri: effectiveRedirectUri,
        }),
      });

      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        res.status(400).json({ error: `Google OAuth exchange failed: ${errText}` });
        return;
      }

      const tokenData: any = await tokenRes.json();
      const accessToken = tokenData.access_token;
      if (!accessToken) {
        res.status(400).json({ error: "No access token received from Google" });
        return;
      }

      let accountName = "Antigravity Google Account";
      try {
        const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo?alt=json", {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });
        if (userRes.ok) {
          const userData: any = await userRes.json();
          if (userData.email) {
            accountName = userData.email;
          }
        }
      } catch (err) {
        console.warn("Failed to fetch Google userinfo:", err);
      }

      const existingProvider = ProviderRepository.getProviderById("antigravity");
      if (!existingProvider) {
        const defaults = ProviderRepository.getProviderWithDefaults("antigravity");
        if (defaults) {
          ProviderRepository.saveProvider(defaults);
        }
      }

      const accountId = `acc_${crypto.randomUUID().slice(0, 8)}`;
      const refreshToken = tokenData.refresh_token || undefined;
      const expiresIn = Number(tokenData.expires_in) || 3600;
      const expiresAt = Date.now() + expiresIn * 1000;

      const storedToken = JSON.stringify({
        accessToken,
        refreshToken,
        expiresAt,
      });

      ProviderRepository.addAccount({
        id: accountId,
        providerId: "antigravity",
        name: accountName,
        rawApiKey: storedToken,
        providerSpecificData: {
          email: accountName,
          refreshToken,
          expiresAt,
        },
      });

      res.json({
        success: true,
        account: {
          id: accountId,
          name: accountName,
          providerId: "antigravity",
        },
      });
      return;
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to exchange OAuth token" });
      return;
    }
  }

  res.status(400).json({ error: `OAuth exchange not implemented for provider '${provider}'` });
});

// ==========================================
// GitHub Copilot Device Code Flow Endpoints
// ==========================================

const GITHUB_COPILOT_CLIENT_ID = "Iv1.REDACTED_GITHUB_CLIENT_ID";

oauthRouter.post("/github/device-code", async (_req, res) => {
  try {
    const response = await fetch("https://github.com/login/device/code", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        client_id: GITHUB_COPILOT_CLIENT_ID,
        scope: "read:user",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      res.status(response.status).json({ error: `GitHub device code error: ${errorText}` });
      return;
    }

    const data = await response.json();
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to initiate GitHub device code" });
  }
});

oauthRouter.post("/github/poll", async (req, res) => {
  const { device_code } = req.body;
  if (!device_code) {
    res.status(400).json({ error: "Missing device_code" });
    return;
  }

  try {
    const response = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        client_id: GITHUB_COPILOT_CLIENT_ID,
        device_code,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      }),
    });

    const data: any = await response.json().catch(() => ({}));
    if (data.error) {
      res.json({ ok: false, error: data.error, error_description: data.error_description });
      return;
    }

    if (data.access_token) {
      let copilotToken = "";
      let copilotTokenExpiresAt = 0;
      let accountName = "GitHub Copilot User";

      try {
        const copilotRes = await fetch("https://api.github.com/copilot_internal/v2/token", {
          headers: {
            Authorization: `Bearer ${data.access_token}`,
            Accept: "application/json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "GithubCopilot/1.155.0",
          },
        });
        if (copilotRes.ok) {
          const cpData: any = await copilotRes.json();
          copilotToken = cpData.token || "";
          copilotTokenExpiresAt = cpData.expires_at || 0;
        }
      } catch (err) {
        console.warn("Failed to fetch Copilot internal token:", err);
      }

      try {
        const userRes = await fetch("https://api.github.com/user", {
          headers: {
            Authorization: `Bearer ${data.access_token}`,
            Accept: "application/json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "GithubCopilot/1.155.0",
          },
        });
        if (userRes.ok) {
          const uData: any = await userRes.json();
          accountName = uData.login || uData.name || accountName;
        }
      } catch (err) {
        console.warn("Failed to fetch GitHub user info:", err);
      }

      const existingProvider = ProviderRepository.getProviderById("github");
      if (!existingProvider) {
        const defaults = ProviderRepository.getProviderWithDefaults("github");
        if (defaults) {
          ProviderRepository.saveProvider(defaults);
        }
      }

      const accountId = `acc_${crypto.randomUUID().slice(0, 8)}`;
      ProviderRepository.addAccount({
        id: accountId,
        providerId: "github",
        name: accountName,
        rawApiKey: data.access_token,
        providerSpecificData: {
          copilotToken,
          copilotTokenExpiresAt,
          githubAccessToken: data.access_token,
          refreshToken: data.refresh_token,
        },
      });

      res.json({ ok: true, success: true, account: { id: accountId, name: accountName } });
      return;
    }

    res.json({ ok: false, error: "authorization_pending" });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to poll GitHub token" });
  }
});

oauthRouter.post("/github/token", async (req, res) => {
  const { token, name } = req.body;
  if (!token || typeof token !== "string") {
    res.status(400).json({ error: "Token is required" });
    return;
  }

  const cleanToken = token.trim();
  let copilotToken = cleanToken;
  let copilotTokenExpiresAt = 0;
  let accountName = name || "GitHub Copilot Key";

  try {
    const cpRes = await fetch("https://api.github.com/copilot_internal/v2/token", {
      headers: {
        Authorization: `Bearer ${cleanToken}`,
        Accept: "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "GithubCopilot/1.155.0",
      },
    });
    if (cpRes.ok) {
      const cpData: any = await cpRes.json();
      if (cpData.token) {
        copilotToken = cpData.token;
        copilotTokenExpiresAt = cpData.expires_at || 0;
      }
    }
  } catch {}

  const existingProvider = ProviderRepository.getProviderById("github");
  if (!existingProvider) {
    const defaults = ProviderRepository.getProviderWithDefaults("github");
    if (defaults) {
      ProviderRepository.saveProvider(defaults);
    }
  }

  const accountId = `acc_${crypto.randomUUID().slice(0, 8)}`;
  ProviderRepository.addAccount({
    id: accountId,
    providerId: "github",
    name: accountName,
    rawApiKey: cleanToken,
    providerSpecificData: {
      copilotToken,
      copilotTokenExpiresAt,
    },
  });

  res.json({ success: true, id: accountId, name: accountName });
});

// ==========================================
// Cursor IDE Auto-Import & Token Endpoints
// ==========================================

function getCursorCandidatePaths(): string[] {
  const home = os.homedir();
  const platform = process.platform;

  if (platform === "darwin") {
    return [
      path.join(home, "Library/Application Support/Cursor/User/globalStorage/state.vscdb"),
      path.join(home, "Library/Application Support/Cursor - Insiders/User/globalStorage/state.vscdb"),
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
    path.join(home, ".config/Cursor/User/globalStorage/state.vscdb"),
    path.join(home, ".config/cursor/User/globalStorage/state.vscdb"),
  ];
}

function extractCursorTokens(dbPath: string): { accessToken: string | null; machineId: string | null } {
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

oauthRouter.get("/cursor/auto-import", (_req, res) => {
  const candidatePaths = getCursorCandidatePaths();
  let foundDbPath: string | null = null;

  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      foundDbPath = p;
      break;
    }
  }

  if (!foundDbPath) {
    res.json({
      found: false,
      error: "Cursor database state.vscdb not found. Ensure Cursor IDE is installed and logged in.",
    });
    return;
  }

  try {
    const tokens = extractCursorTokens(foundDbPath);
    if (!tokens.accessToken) {
      res.json({
        found: false,
        error: "Cursor session token not found in state.vscdb. Please log into Cursor IDE.",
      });
      return;
    }

    res.json({
      found: true,
      accessToken: tokens.accessToken,
      machineId: tokens.machineId || "desktop-cursor-client",
    });
  } catch (err: any) {
    res.json({
      found: false,
      error: err.message || "Could not read Cursor IDE database",
    });
  }
});

oauthRouter.post("/cursor/import", (req, res) => {
  const { accessToken, machineId, name } = req.body;
  if (!accessToken) {
    res.status(400).json({ error: "Access token is required" });
    return;
  }

  const existingProvider = ProviderRepository.getProviderById("cursor");
  if (!existingProvider) {
    const defaults = ProviderRepository.getProviderWithDefaults("cursor");
    if (defaults) {
      ProviderRepository.saveProvider(defaults);
    }
  }

  const accountId = `acc_${crypto.randomUUID().slice(0, 8)}`;
  const accountName = name || "Cursor Desktop Account";

  ProviderRepository.addAccount({
    id: accountId,
    providerId: "cursor",
    name: accountName,
    rawApiKey: accessToken,
    providerSpecificData: {
      accessToken,
      machineId: machineId || "desktop-cursor-client",
    },
  });

  res.json({ success: true, id: accountId, name: accountName });
});

// ==========================================
// Kiro IDE Auto-Import & Token Endpoints
// ==========================================

oauthRouter.get("/kiro/auto-import", (_req, res) => {
  const cachePath = path.join(os.homedir(), ".aws", "sso", "cache");
  if (!fs.existsSync(cachePath)) {
    res.json({
      found: false,
      error: "AWS SSO cache not found at ~/.aws/sso/cache. Please sign into Kiro IDE first.",
    });
    return;
  }

  try {
    const files = fs.readdirSync(cachePath);
    let refreshToken: string | null = null;
    let tokenData: any = null;

    // Check kiro-auth-token.json first
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
      res.json({
        found: false,
        error: "Kiro token starting with 'aorAAAAAG' not found in ~/.aws/sso/cache.",
      });
      return;
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

    res.json({
      found: true,
      refreshToken,
      clientId,
      clientSecret,
      region: tokenData?.region || "us-east-1",
      authMethod: tokenData?.authMethod || (clientId ? "idc" : "builder-id"),
      profileArn,
    });
  } catch (err: any) {
    res.json({
      found: false,
      error: err.message || "Failed to scan AWS SSO cache",
    });
  }
});

oauthRouter.post("/kiro/import", (req, res) => {
  const { refreshToken, clientId, clientSecret, region, authMethod, profileArn, name } = req.body;
  if (!refreshToken) {
    res.status(400).json({ error: "Refresh token is required" });
    return;
  }

  const existingProvider = ProviderRepository.getProviderById("kiro");
  if (!existingProvider) {
    const defaults = ProviderRepository.getProviderWithDefaults("kiro");
    if (defaults) {
      ProviderRepository.saveProvider(defaults);
    }
  }

  const accountId = `acc_${crypto.randomUUID().slice(0, 8)}`;
  const accountName = name || (clientId ? "Kiro Enterprise (IDC)" : "Kiro AWS Builder ID");

  ProviderRepository.addAccount({
    id: accountId,
    providerId: "kiro",
    name: accountName,
    rawApiKey: refreshToken,
    providerSpecificData: {
      refreshToken,
      clientId: clientId || null,
      clientSecret: clientSecret || null,
      region: region || "us-east-1",
      authMethod: authMethod || (clientId ? "idc" : "builder-id"),
      profileArn: profileArn || null,
    },
  });

  res.json({ success: true, id: accountId, name: accountName });
});

oauthRouter.post("/kiro/api-key", (req, res) => {
  const { apiKey, region, name } = req.body;
  if (!apiKey) {
    res.status(400).json({ error: "API key is required" });
    return;
  }

  const existingProvider = ProviderRepository.getProviderById("kiro");
  if (!existingProvider) {
    const defaults = ProviderRepository.getProviderWithDefaults("kiro");
    if (defaults) {
      ProviderRepository.saveProvider(defaults);
    }
  }

  const accountId = `acc_${crypto.randomUUID().slice(0, 8)}`;
  const accountName = name || "Kiro Headless API Key";

  ProviderRepository.addAccount({
    id: accountId,
    providerId: "kiro",
    name: accountName,
    rawApiKey: apiKey,
    providerSpecificData: {
      region: region || "us-east-1",
      authMethod: "api-key",
    },
  });

  res.json({ success: true, id: accountId, name: accountName });
});
