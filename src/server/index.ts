import express from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";
import { initConsoleLogCapture } from "./utils/consoleLogBuffer.js";

// Initialize console log capture before any other modules log to console
initConsoleLogCapture();

import { DEFAULT_PORT, DEFAULT_HOST, APP_NAME, APP_VERSION } from "../shared/constants/index.js";
import { handleProxyRequest } from "./proxy/chatProxy.js";
import { providerRouter } from "./routes/apiProviders.js";
import { modelRouter } from "./routes/apiModels.js";
import { statsRouter } from "./routes/apiStats.js";
import { comboRouter } from "./routes/apiCombos.js";
import { mitmRouter } from "./routes/apiMitm.js";
import { oauthRouter } from "./routes/apiOAuth.js";
import { cliToolsRouter } from "./routes/apiCliTools.js";
import { consoleLogsRouter } from "./routes/apiConsoleLogs.js";
import { quotaRouter } from "./routes/apiQuota.js";
import { usageRouter } from "./routes/apiUsage.js";
import { MitmRepository } from "../storage/repositories/mitmRepo.js";

const app = express();
const port = Number(process.env.PORT) || DEFAULT_PORT;
const host = process.env.HOST || DEFAULT_HOST;

app.use(cors());
app.use(express.json({ limit: "50mb" }));

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

// OAuth Callback Relay Endpoint
app.get("/callback", (_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Routen OAuth Callback</title>
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
    <p id="desc">Connecting your account to Routen. Please wait...</p>
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
      desc.textContent = "Please copy the full URL from your browser address bar and paste it in Routen.";
    }
  </script>
</body>
</html>`);
});

import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
  server = app.listen(port, host, () => {
    console.log(`🚀 [${APP_NAME} v${APP_VERSION}] Gateway running at http://${host}:${port}`);
    try {
      const dnsStatus = MitmRepository.getAllToolDnsStatus();
      console.log(`📡 [MITM] Inspecting tool-level DNS isolation on boot:`, dnsStatus);
    } catch (err) {
      console.warn(`[MITM] Could not inspect cold boot tool DNS status:`, err);
    }
  });

  process.on("SIGINT", () => {
    server?.close(() => process.exit(0));
  });

  process.on("SIGTERM", () => {
    server?.close(() => process.exit(0));
  });
}

export default app;
