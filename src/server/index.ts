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
import { serverRouter, handleShutdownRequest } from "./routes/apiServer.js";
import { serverLifecycle } from "./lifecycle.js";
import { initTray } from "../cli/tray/tray.js";
import { MitmRepository } from "../storage/repositories/mitmRepo.js";
import { ProviderRepository } from "../storage/repositories/providerRepo.js";
import { tokenScheduler } from "../core/scheduler/tokenScheduler.js";

const app = express();
const port = Number(process.env.PORT) || DEFAULT_PORT;
const host = process.env.HOST || DEFAULT_HOST;

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(requestLogger);

// Health check endpoint
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    app: APP_NAME,
    version: APP_VERSION,
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
app.use("/api/cli-tools", cliToolsRouter);
app.use("/api/console-logs", consoleLogsRouter);
app.use("/api/quota", quotaRouter);
app.use("/api/usage", usageRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/server", serverRouter);
app.post("/api/shutdown", handleShutdownRequest);

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

    // 1. postMessage to opener
    if (window.opener) {
      try {
        window.opener.postMessage({ type: "oauth_callback", data: callbackData }, "*");
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

  const candidatePaths: string[] = [];
  const categories = ["runtime", "catalog", "composite"];

  for (const cat of categories) {
    candidatePaths.push(
      path.resolve(process.cwd(), "src", "providers", cat, provider, "assets", file),
      path.resolve(__dirname, "../../src/providers", cat, provider, "assets", file),
      path.resolve(__dirname, "../providers", cat, provider, "assets", file)
    );
  }

  candidatePaths.push(
    path.resolve(process.cwd(), "src", "providers", provider, "assets", file),
    path.resolve(__dirname, "../../src/providers", provider, "assets", file),
    path.resolve(__dirname, "../providers", provider, "assets", file),
    path.resolve(process.cwd(), "src", "cli", "tools", "definitions", provider, "assets", file),
    path.resolve(__dirname, "../../src/cli/tools/definitions", provider, "assets", file),
    path.resolve(__dirname, "../cli/tools/definitions", provider, "assets", file),
    path.resolve(process.cwd(), "src", "mitm", "handlers", provider, "assets", file),
    path.resolve(__dirname, "../../src/mitm/handlers", provider, "assets", file),
    path.resolve(__dirname, "../mitm/handlers", provider, "assets", file),
    path.resolve(process.cwd(), "dist", "web", "assets", "providers", provider, file),
    path.resolve(process.cwd(), "dist", "web", "assets", "tools", provider, file)
  );

  for (const filePath of candidatePaths) {
    try {
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        res.setHeader("Cache-Control", "public, max-age=86400");
        res.sendFile(filePath);
        return;
      }
    } catch {
      // Continue checking next candidate path
    }
  }

  res.status(404).send("Provider asset not found");
});

// Serve web frontend when built (relative to server directory or root)
const webDistPath = fs.existsSync(path.resolve(__dirname, "../web"))
  ? path.resolve(__dirname, "../web")
  : path.resolve(process.cwd(), "dist/web");

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
    logger.info("SERVER", `[${APP_NAME} v${APP_VERSION}] Gateway running at http://${host}:${port}`);
    try {
      const dnsStatus = MitmRepository.getAllToolDnsStatus();
      logger.info("MITM", "Inspecting tool-level DNS isolation on boot:", dnsStatus);
    } catch (err) {
      logger.warn("MITM", "Could not inspect cold boot tool DNS status:", err);
    }

    // Initialize system tray if running in background daemon mode or tray explicitly requested
    if (process.env.MAPIGATE_DAEMON === "1" || process.env.MAPIGATE_TRAY === "1") {
      try {
        initTray({
          port,
          onQuit: () => {
            serverLifecycle.shutdownServer({ delayMs: 0, exitProcess: true });
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
