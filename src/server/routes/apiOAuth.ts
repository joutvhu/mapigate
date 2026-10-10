import { Router } from "express";
import crypto from "node:crypto";
import { ProviderRepository } from "../../storage/repositories/providerRepo.js";

export const oauthRouter = Router();

const ANTIGRAVITY_CLIENT_ID = "REDACTED_GOOGLE_CLIENT_ID.apps.googleusercontent.com";
const ANTIGRAVITY_CLIENT_SECRET = "REDACTED_GOOGLE_CLIENT_SECRET";
const ANTIGRAVITY_SCOPES = [
  "https://www.googleapis.com/auth/cloud-platform",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/cclog",
  "https://www.googleapis.com/auth/experimentsandconfigs",
];

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
      // Exchange code for Google tokens
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

      // Fetch user profile info (email)
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

      // Ensure provider exists in DB
      let existingProvider = ProviderRepository.getProviderById("antigravity");
      if (!existingProvider) {
        const defaults = ProviderRepository.getProviderWithDefaults("antigravity");
        if (defaults) {
          ProviderRepository.saveProvider(defaults);
        }
      }

      const accountId = `acc_${crypto.randomUUID().slice(0, 8)}`;
      ProviderRepository.addAccount({
        id: accountId,
        providerId: "antigravity",
        name: accountName,
        rawApiKey: accessToken,
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
