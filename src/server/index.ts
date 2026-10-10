import express from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";
import { DEFAULT_PORT, DEFAULT_HOST, APP_NAME, APP_VERSION } from "../shared/constants/index.js";
import { handleProxyRequest } from "./proxy/chatProxy.js";
import { providerRouter } from "./routes/apiProviders.js";
import { modelRouter } from "./routes/apiModels.js";
import { statsRouter } from "./routes/apiStats.js";
import { comboRouter } from "./routes/apiCombos.js";
import { mitmRouter } from "./routes/apiMitm.js";

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

const server = app.listen(port, host, () => {
  console.log(`🚀 [${APP_NAME} v${APP_VERSION}] Gateway running at http://${host}:${port}`);
});

process.on("SIGINT", () => {
  server.close(() => process.exit(0));
});

process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
});

export default app;
