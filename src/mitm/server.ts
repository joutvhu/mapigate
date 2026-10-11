import https from "node:https";
import tls from "node:tls";
import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { ROOT_CA_KEY_PATH, ROOT_CA_CERT_PATH, generateRootCA } from "./cert/rootCA.js";
import { getCertForDomain } from "./cert/generate.js";
import { interceptAntigravity } from "./handlers/antigravity.js";
import { interceptKiro } from "./handlers/kiro.js";
import { interceptCopilot } from "./handlers/copilot.js";
import { interceptCursor } from "./handlers/cursor.js";
import { passthroughHttps } from "./handlers/base.js";
import { MitmRepository } from "../storage/repositories/mitmRepo.js";
import {
  getToolForHost,
  isChatRequest,
  extractModel,
  MODEL_SYNONYMS,
  MODEL_PATTERNS,
  MODEL_NO_MAP,
  type MitmToolId,
} from "../shared/constants/mitmToolHosts.js";
import { removeAllDNSEntriesSync } from "./dns/dnsConfig.js";

const DEFAULT_PRIMARY_PORT = 443;

const certCache = new Map<string, tls.SecureContext>();
let rootCAPem: string = "";

function sniCallback(servername: string, cb: (err: Error | null, ctx?: tls.SecureContext) => void) {
  try {
    if (certCache.has(servername)) {
      return cb(null, certCache.get(servername)!);
    }
    const certData = getCertForDomain(servername);
    if (!certData) {
      return cb(new Error(`Failed to generate dynamic cert for ${servername}`));
    }
    const ctx = tls.createSecureContext({
      key: certData.key,
      cert: `${certData.cert}\n${rootCAPem}`,
    });
    certCache.set(servername, ctx);
    cb(null, ctx);
  } catch (err: any) {
    cb(err);
  }
}

function resolveModelMapping(tool: string, incomingModel?: string | null): string | null {
  if (!incomingModel) return null;
  const mappings = MitmRepository.getMappings(tool);
  if (mappings.length === 0) return null;

  const normalized = incomingModel.replace(/^models\//, "");
  const synonym = MODEL_SYNONYMS[tool]?.[normalized] || normalized;

  // 1. Exact match with synonym or normalized
  const exact = mappings.find(
    (m) =>
      m.sourceModel.toLowerCase() === synonym.toLowerCase() ||
      m.sourceModel.toLowerCase() === normalized.toLowerCase()
  );
  if (exact) return exact.targetModel;

  // 2. Prefix match
  const prefix = mappings.find(
    (m) =>
      synonym.toLowerCase().startsWith(m.sourceModel.toLowerCase()) ||
      m.sourceModel.toLowerCase().startsWith(synonym.toLowerCase())
  );
  if (prefix) return prefix.targetModel;

  // 3. Pattern match (catches renamed or generic flash/opus variants)
  const patterns = MODEL_PATTERNS[tool] || [];
  for (const { match, alias } of patterns) {
    if (match.test(synonym)) {
      const patternMapped = mappings.find(
        (m) => m.sourceModel.toLowerCase() === alias.toLowerCase()
      );
      if (patternMapped) return patternMapped.targetModel;
    }
  }

  return mappings[0]?.targetModel || null;
}

function collectBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function handleMitmRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    if (req.url === "/_mitm_health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, pid: process.pid }));
      return;
    }

    const bodyBuffer = await collectBody(req);

    // Anti-loop: skip requests originated from Mapigate itself
    if (req.headers["x-request-source"] === "local") {
      return passthroughHttps(req, res, bodyBuffer);
    }

    const host = req.headers.host || "";
    const tool = getToolForHost(host);

    // If host is not a recognized MITM tool domain, safely pass through upstream
    if (!tool) {
      return passthroughHttps(req, res, bodyBuffer);
    }

    // Check if DNS / interception is active for this tool
    const dnsActive = MitmRepository.getToolDnsStatus(tool);
    if (!dnsActive) {
      return passthroughHttps(req, res, bodyBuffer);
    }

    // Pass through non-chat traffic (telemetry, auth, experiments, etc.)
    if (!isChatRequest(tool, req)) {
      return passthroughHttps(req, res, bodyBuffer);
    }

    // Cursor uses binary proto — delegate directly to Cursor handler
    if (tool === "cursor") {
      return interceptCursor(req, res, bodyBuffer, null, passthroughHttps);
    }

    const incomingModel = extractModel(req.url, bodyBuffer);

    // Bypass models that must never be re-routed (e.g. Antigravity inline tab autocomplete)
    if (incomingModel && (MODEL_NO_MAP[tool] || []).some((re) => re.test(incomingModel))) {
      return passthroughHttps(req, res, bodyBuffer);
    }

    const mappedModel = resolveModelMapping(tool, incomingModel);
    if (!mappedModel) {
      return passthroughHttps(req, res, bodyBuffer);
    }

    switch (tool) {
      case "antigravity":
        await interceptAntigravity(req, res, bodyBuffer, mappedModel);
        break;
      case "kiro":
        await interceptKiro(req, res, bodyBuffer, mappedModel);
        break;
      case "copilot":
        await interceptCopilot(req, res, bodyBuffer, mappedModel);
        break;
    }
  } catch (error: any) {
    console.error("[MITM Server] Unhandled error:", error.message);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
    }
    res.end(JSON.stringify({ error: { message: error?.message || "Internal MITM Proxy Error", type: "mitm_error" } }));
  }
}

export class MitmServer {
  private server: https.Server | null = null;
  private port: number = DEFAULT_PRIMARY_PORT;
  private running: boolean = false;

  public async start(preferredPort: number = DEFAULT_PRIMARY_PORT): Promise<number> {
    if (this.running && this.server) {
      return this.port;
    }

    if (!fs.existsSync(ROOT_CA_KEY_PATH) || !fs.existsSync(ROOT_CA_CERT_PATH)) {
      generateRootCA();
    }

    const rootKey = fs.readFileSync(ROOT_CA_KEY_PATH, "utf8");
    const rootCert = fs.readFileSync(ROOT_CA_CERT_PATH, "utf8");
    rootCAPem = rootCert;

    const sslOptions: https.ServerOptions = {
      key: rootKey,
      cert: rootCert,
      SNICallback: sniCallback,
    };

    return new Promise((resolve, reject) => {
      const srv = https.createServer(sslOptions, (req, res) => {
        handleMitmRequest(req, res);
      });

      srv.on("error", (err: any) => {
        console.error(`[MITM] Server failed to bind on port ${preferredPort}:`, err.message);
        this.running = false;
        this.server = null;
        reject(err);
      });

      srv.listen(preferredPort, "0.0.0.0", () => {
        this.server = srv;
        this.port = preferredPort;
        this.running = true;
        console.log(`[MITM] HTTPS Proxy server running on port ${preferredPort}`);
        resolve(preferredPort);
      });
    });
  }

  public stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.server = null;
          this.running = false;
          resolve();
        });
      } else {
        this.running = false;
        resolve();
      }
    });
  }

  public getStatus() {
    return {
      running: this.running,
      port: this.port,
    };
  }
}

export const mitmServerInstance = new MitmServer();

// Clean up DNS entries on unexpected process exit
let shutdownHookRegistered = false;
if (!shutdownHookRegistered) {
  shutdownHookRegistered = true;
  const onExit = () => {
    removeAllDNSEntriesSync();
  };
  process.on("exit", onExit);
  process.on("SIGINT", () => {
    onExit();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    onExit();
    process.exit(0);
  });
}
