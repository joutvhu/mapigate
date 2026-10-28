import express from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";
import { initConsoleLogCapture } from "./utils/consoleLogBuffer.js";
import { logger } from "../shared/logger.js";
import { requestLogger } from "./middlewares/requestLogger.js";

// Initialize console log capture before any other modules log to console
initConsoleLogCapture();

import { DEFAULT_PORT, DEFAULT_HOST, APP_NAME, APP_VERSION } from "../shared/constants/index.js";
import { handleProxyRequest } from "./proxy/chatProxy.js";
import { convertResponsesApiFormat } from "../core/adapters/responsesAdapter.js";
import { providerRouter } from "./routes/apiProviders.js";
import { modelRouter, handleOpenAiModelsList } from "./routes/apiModels.js";
import { statsRouter } from "./routes/apiStats.js";
import { comboRouter } from "./routes/apiCombos.js";
import { mitmRouter } from "./routes/apiMitm.js";
import { oauthRouter } from "./routes/apiOAuth.js";
import { cliToolsRouter } from "./routes/apiCliTools.js";
import { consoleLogsRouter } from "./routes/apiConsoleLogs.js";
import { quotaRouter } from "./routes/apiQuota.js";
import { usageRouter } from "./routes/apiUsage.js";
import { settingsRouter } from "./routes/apiSettings.js";
import { authRouter } from "./routes/apiAuth.js";
import { masterAuthMiddleware } from "./middlewares/masterAuthMiddleware.js";
import { serverRouter, handleShutdownRequest, handleRestartRequest } from "./routes/apiServer.js";
import { serverLifecycle } from "./lifecycle.js";
import { initTray } from "../cli/tray/tray.js";
import { MitmRepository } from "../storage/repositories/mitmRepo.js";
import { ProviderRepository } from "../storage/repositories/providerRepo.js";
import { tokenScheduler } from "../core/scheduler/tokenScheduler.js";
import { PidFileManager } from "../cli/daemon/pidFile.js";
import { SettingsRepository } from "../storage/repositories/settingsRepo.js";
import { getRegistryProvider } from "../providers/core/metadataRegistry.js";

// Sync persisted log level from settings repository if env is not explicitly set
const envLevel = process.env.LOG_LEVEL || process.env.MAPIGATE_LOG_LEVEL;
if (envLevel) {
  logger.setLevel(envLevel);
} else {
  try {
    const savedLevel = SettingsRepository.getLogLevel();
    if (savedLevel) {
      logger.setLevel(savedLevel);
    }
  } catch {}
}

const app = express();
const port = Number(process.env.PORT) || DEFAULT_PORT;
const host = process.env.HOST || DEFAULT_HOST;

// Secure CORS configuration: allow CLI/desktop tools and localhost/webview origins, block foreign internet origins
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (curl, mobile apps, direct AI coding CLIs like Claude Code, Cursor)
      if (!origin) {
        return callback(null, true);
      }

      // Allow custom origin override from environment if explicitly provided
      const customOrigin = process.env.MAPIGATE_CORS_ORIGIN;
      if (customOrigin && (origin === customOrigin || customOrigin === "*")) {
        return callback(null, true);
      }

      // Allow loopback origins (localhost, 127.0.0.1, IPv6 [::1] on any port) and IDE webviews
      const isTrustedLocalOrigin =
        /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin) ||
        origin.startsWith("vscode-webview://") ||
        origin.startsWith("chrome-extension://");

      if (isTrustedLocalOrigin) {
        return callback(null, true);
      }

      // Deny untrusted foreign origin (prevents malicious websites from driving local Mapigate proxy)
      return callback(null, false);
    },
    credentials: true,
  })
);
app.use(express.json({ limit: "50mb" }));
app.use(requestLogger);

// Health check endpoint
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    app: APP_NAME,
    version: APP_VERSION,
    port: serverLifecycle.getPort(),
    timestamp: Date.now(),
  });
});

// Proxy routes for AI Coding Tools
app.post("/v1/chat/completions", (req, res) => {
  handleProxyRequest(req, res, "openai");
});

app.post("/v1/messages", (req, res) => {
  handleProxyRequest(req, res, "anthropic");
});

app.post(["/v1/responses", "/responses"], (req, res) => {
  if (req.body?.input || req.body?.conversationState || req.body?.messages) {
    req.body = convertResponsesApiFormat(req.body);
  }
  handleProxyRequest(req, res, "responses");
});

app.get("/v1/models", handleOpenAiModelsList);
app.get("/models", handleOpenAiModelsList);

// Master Password auth endpoints
app.use("/api/auth", authRouter);

// Guard management /api/* routes when master password is configured
app.use("/api", masterAuthMiddleware);

// Dashboard Management APIs
app.use("/api/providers", providerRouter);
app.use("/api/models", modelRouter);
app.use("/api/stats", statsRouter);
app.use("/api/combos", comboRouter);
app.use("/api/mitm", mitmRouter);
app.use("/api/oauth", oauthRouter);
app.use(["/api/cli-tools", "/api/tools", "/api/model-mappings"], cliToolsRouter);
app.use("/api/console-logs", consoleLogsRouter);
app.use("/api/quota", quotaRouter);
app.use("/api/usage", usageRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/server", serverRouter);
app.post("/api/shutdown", handleShutdownRequest);
app.post("/api/restart", handleRestartRequest);

// OAuth Callback Relay Endpoint
app.get(["/callback", "/auth/callback"], (_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Mapigate OAuth Callback</title>
  <style>
    body {
      background: #0A0D14;
      color: #E2E8F0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
    }
    .box {
      text-align: center;
      padding: 2rem;
      max-width: 440px;
    }
    .spinner {
      width: 48px;
      height: 48px;
      margin: 0 auto 1.5rem;
      border: 3px solid rgba(59, 130, 246, 0.2);
      border-top-color: #3B82F6;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    h1 { font-size: 1.25rem; font-weight: 600; margin-bottom: 0.5rem; }
    p { color: #94A3B8; font-size: 0.875rem; margin: 0; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="box">
    <div class="spinner" id="icon"></div>
    <h1 id="title">Processing Authorization...</h1>
    <p id="desc">Connecting your account to Mapigate. Please wait...</p>
  </div>
  <script>
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const token = params.get("token");
    const state = params.get("state");
    const error = params.get("error");
    const errorDescription = params.get("error_description");

    const callbackData = {
      code,
      token,
      state,
      error,
      errorDescription,
      fullUrl: window.location.href,
    };

    // 1. postMessage to opener with origin validation
    if (window.opener) {
      try {
        const targetOrigin = window.location.origin || "*";
        window.opener.postMessage({ type: "oauth_callback", data: callbackData }, targetOrigin);
      } catch (e) {}
    }

    // 2. BroadcastChannel
    try {
      const channel = new BroadcastChannel("oauth_callback");
      channel.postMessage(callbackData);
      channel.close();
    } catch (e) {}

    // 3. localStorage fallback
    try {
      localStorage.setItem("oauth_callback", JSON.stringify({ ...callbackData, timestamp: Date.now() }));
    } catch (e) {}

    const title = document.getElementById("title");
    const desc = document.getElementById("desc");
    if (code || token) {
      title.textContent = "Authorization Successful!";
      desc.textContent = "This window will close automatically...";
      setTimeout(() => {
        window.close();
      }, 1500);
    } else if (error) {
      title.textContent = "Authorization Failed";
      desc.textContent = errorDescription || error;
    } else {
      title.textContent = "Copy Callback URL";
      desc.textContent = "Please copy the full URL from your browser address bar and paste it in Mapigate.";
    }
  </script>
</body>
</html>`);
});

import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve package root relative to server directory (works in both src/ and dist/)
const packageRoot = path.resolve(__dirname, "../..");

// Serve web frontend when built (relative to server directory or root)
const webDistPath = fs.existsSync(path.resolve(__dirname, "../web"))
  ? path.resolve(__dirname, "../web")
  : fs.existsSync(path.resolve(packageRoot, "dist/web"))
    ? path.resolve(packageRoot, "dist/web")
    : path.resolve(process.cwd(), "dist/web");

// Provider and tool custom assets endpoint (icons, branding)
app.get(["/assets/providers/:provider/:file", "/assets/tools/:provider/:file", "/assets/cli-tools/:provider/:file"], (req, res) => {
  const provider = typeof req.params.provider === "string" ? req.params.provider : String(req.params.provider || "");
  const file = typeof req.params.file === "string" ? req.params.file : String(req.params.file || "");

  // Validate parameters against path traversal and invalid characters
  if (
    !provider ||
    !file ||
    !/^[a-zA-Z0-9_-]+$/.test(provider) ||
    !/^[a-zA-Z0-9_.-]+$/.test(file) ||
    file.includes("..")
  ) {
    res.status(400).send("Invalid asset path");
    return;
  }

  // Resolve aliases (e.g. devin-cli -> devin, copilot -> github)
  const reg = getRegistryProvider(provider);
  const resolvedProvider = reg?.id && reg.id !== provider ? reg.id : undefined;
  const candidateProviderIds = resolvedProvider ? [provider, resolvedProvider] : [provider];

  // Potential directories where the provider or tool assets may reside
  const searchDirs: string[] = [];
  for (const p of candidateProviderIds) {
    searchDirs.push(
      // Built web distribution (primary in production and npm packages)
      path.resolve(webDistPath, "assets", "providers", p),
      path.resolve(webDistPath, "assets", "tools", p),
      path.resolve(webDistPath, "assets", "cli-tools", p),
      path.resolve(__dirname, "../web", "assets", "providers", p),
      path.resolve(__dirname, "../web", "assets", "tools", p),
      // Source directories (for development mode)
      path.resolve(packageRoot, "src", "providers", "runtime", p, "assets"),
      path.resolve(packageRoot, "src", "providers", "catalog", p, "assets"),
      path.resolve(packageRoot, "src", "providers", "composite", p, "assets"),
      path.resolve(packageRoot, "src", "providers", p, "assets"),
      path.resolve(packageRoot, "src", "cli", "tools", "definitions", p, "assets"),
      path.resolve(packageRoot, "src", "mitm", "handlers", p, "assets"),
      // Fallback relative to process.cwd()
      path.resolve(process.cwd(), "dist", "web", "assets", "providers", p),
      path.resolve(process.cwd(), "dist", "web", "assets", "tools", p),
      path.resolve(process.cwd(), "src", "providers", "runtime", p, "assets"),
      path.resolve(process.cwd(), "src", "providers", "catalog", p, "assets"),
      path.resolve(process.cwd(), "src", "providers", p, "assets"),
      path.resolve(process.cwd(), "src", "cli", "tools", "definitions", p, "assets"),
      path.resolve(process.cwd(), "src", "mitm", "handlers", p, "assets")
    );
  }

  // Variations to try if the exact file is not present (e.g. icon.png -> cursor.png, icon.svg, etc.)
  const fileVariations: string[] = [file, "icon.png", "icon.svg"];
  for (const p of candidateProviderIds) {
    fileVariations.push(`${p}.png`, `${p}.svg`);
  }
  fileVariations.push("logo.png", "logo.svg");

  for (const dir of searchDirs) {
    try {
      if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) continue;

      // 1. Try exact requested file first, then common variations
      for (const variation of fileVariations) {
        const candidate = path.resolve(dir, variation);
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          res.setHeader("Cache-Control", "public, max-age=86400");
          res.sendFile(candidate);
          return;
        }
      }

      // 2. If still not found, check any image file in that asset directory
      const allFiles = fs.readdirSync(dir);
      const anyImage = allFiles.find((f) => /\.(png|svg|webp|ico|jpe?g)$/i.test(f));
      if (anyImage) {
        const candidate = path.resolve(dir, anyImage);
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          res.setHeader("Cache-Control", "public, max-age=86400");
          res.sendFile(candidate);
          return;
        }
      }
    } catch {
      // Continue checking next search directory
    }
  }

  // If the provider is known in the registry or catalog, but has no custom asset file on disk:
  // Serve a sleek SVG avatar with the provider's brand color & initials instead of 404 console errors!
  if (reg) {
    const displayName = reg.name || provider;
    const initials = displayName.trim().slice(0, 2).toUpperCase() || "AI";
    const brandColor = reg.color || "#6366F1";
    const svgFallback = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="40" height="40">
  <rect width="40" height="40" rx="10" fill="#0F172A" stroke="#1E293B" stroke-width="1.5"/>
  <text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="${brandColor}" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif" font-weight="bold" font-size="14">${initials}</text>
</svg>`;

    res.setHeader("Content-Type", "image/svg+xml");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.status(200).send(svgFallback);
    return;
  }

  res.status(404).send("Provider asset not found");
});

if (fs.existsSync(webDistPath)) {
  app.use(express.static(webDistPath));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(webDistPath, "index.html"));
  });
}

const isTest =
  process.env.NODE_ENV === "test" ||
  Boolean(process.env.NODE_TEST_CONTEXT) ||
  process.argv.some((arg) => arg.includes("test"));

let server: any = null;
if (!isTest) {
  // Start background token refresh scheduler
  tokenScheduler.start();

  // Ensure core providers are pre-seeded on boot
  try {
    ProviderRepository.seedDefaultProviders();
  } catch (err) {
    console.warn(`[Providers] Could not seed default providers on boot:`, err);
  }

  server = app.listen(port, host, () => {
    serverLifecycle.setServer(server);
    try {
      PidFileManager.writePid(process.pid, port);
    } catch {
      // Best-effort
    }
    logger.info("SERVER", `[${APP_NAME} v${APP_VERSION}] Gateway running at http://${host}:${port}`);
    try {
      const dnsStatus = MitmRepository.getAllToolDnsStatus();
      logger.info("MITM", "Inspecting tool-level DNS isolation on boot:", dnsStatus);
      const hasActiveToolDns = Object.values(dnsStatus).some(Boolean);
      if (MitmRepository.getMitmServerRunning() || hasActiveToolDns) {
        import("../mitm/manager.js")
          .then(async ({ mitmManager }) => {
            const mitmPort = await mitmManager.startServer({ forceKill: false });
            MitmRepository.setMitmServerRunning(true);
            logger.info("MITM", `HTTPS Proxy server automatically started on port ${mitmPort}`);
          })
          .catch((err) => {
            logger.warn("MITM", `Cold boot HTTPS Proxy start skipped or port conflict: ${err.message}`);
          });
      }
    } catch (err) {
      logger.warn("MITM", "Could not inspect cold boot tool DNS status:", err);
    }

    // Initialize system tray if running in background daemon mode or tray explicitly requested
    if (
      process.env.MAPIGATE_DAEMON === "1" ||
      process.env.MAPIGATE_TRAY === "1" ||
      process.argv.includes("--tray") ||
      process.argv.includes("--daemon") ||
      process.argv.includes("-d")
    ) {
      try {
        initTray({
          port,
          onQuit: () => {
            serverLifecycle.shutdownServer({ delayMs: 0, exitProcess: true });
          },
          onRestart: () => {
            serverLifecycle.restartServer({ delayMs: 0, exitProcess: true });
          },
        });
      } catch (err) {
        console.warn(`[Tray] Could not initialize system tray:`, err);
      }
    }
  });

  process.on("SIGINT", () => {
    serverLifecycle.shutdownServer({ delayMs: 0, exitProcess: true });
  });

  process.on("SIGTERM", () => {
    serverLifecycle.shutdownServer({ delayMs: 0, exitProcess: true });
  });
}

export { app, tokenScheduler };
export default app;
