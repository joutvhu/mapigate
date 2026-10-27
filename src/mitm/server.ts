import https from "node:https";
import tls from "node:tls";
import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { ROOT_CA_KEY_PATH, ROOT_CA_CERT_PATH, generateRootCA } from "./cert/rootCA.js";
import { getCertForDomain } from "./cert/generate.js";
import {
  passthroughHttps,
  registerAllMitmHandlers,
} from "./handlers/index.js";
import { MitmHandlerRegistry } from "./registry.js";
import { MitmRepository } from "../storage/repositories/mitmRepo.js";
import {
  getToolForHost,
  isChatRequest,
  isModelDiscoveryRequest,
  extractModel,
  normalizeModelSlug,
  MODEL_SYNONYMS,
  MODEL_PATTERNS,
  MODEL_NO_MAP,
  type MitmToolId,
} from "./config.js";
import { removeAllDNSEntriesSync } from "./dns/dnsConfig.js";

registerAllMitmHandlers(MitmHandlerRegistry);

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

export function resolveModelMapping(tool: string, incomingModel?: string | null): string | null {
  if (!incomingModel) return null;
  const mappings = MitmRepository.getMappings(tool);
  if (mappings.length === 0) return null;

  const rawNormalized = incomingModel.replace(/^models\//, "").trim();
  const incomingSlug = normalizeModelSlug(incomingModel);

  const toolSynonyms = MODEL_SYNONYMS[tool] || {};
  const synonymTarget =
    toolSynonyms[rawNormalized] ||
    toolSynonyms[rawNormalized.toLowerCase()] ||
    toolSynonyms[incomingSlug] ||
    rawNormalized;
  const synonymSlug = normalizeModelSlug(synonymTarget);

  // 1. Exact match with synonym or normalized or slug
  for (const m of mappings) {
    const mLower = m.sourceModel.toLowerCase();
    const mSlug = normalizeModelSlug(m.sourceModel);
    if (
      mLower === rawNormalized.toLowerCase() ||
      mLower === synonymTarget.toLowerCase() ||
      mSlug === incomingSlug ||
      mSlug === synonymSlug
    ) {
      return m.targetModel.trim() || null;
    }
  }

  // 2. Prefix match
  for (const m of mappings) {
    const mSlug = normalizeModelSlug(m.sourceModel);
    const mLower = m.sourceModel.toLowerCase();
    if (
      incomingSlug.startsWith(mSlug) ||
      synonymSlug.startsWith(mSlug) ||
      mLower.startsWith(rawNormalized.toLowerCase())
    ) {
      return m.targetModel.trim() || null;
    }
  }

  // 3. Pattern match (catches renamed or generic flash/opus variants)
  const patterns = MODEL_PATTERNS[tool] || [];
  for (const { match, alias } of patterns) {
    if (match.test(rawNormalized) || match.test(synonymTarget) || match.test(incomingSlug)) {
      const aliasSlug = normalizeModelSlug(alias);
      const patternMapped = mappings.find(
        (m) =>
          m.sourceModel.toLowerCase() === alias.toLowerCase() ||
          normalizeModelSlug(m.sourceModel) === aliasSlug
      );
      if (patternMapped) return patternMapped.targetModel.trim() || null;
    }
  }

  return null;
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

    // Loop detection guard (MITM-02)
    if (req.headers["x-mapigate-mitm-loop"]) {
      console.warn(`[MITM Server] Infinite proxy loop detected for ${req.headers.host || ""}${req.url || ""}`);
      res.writeHead(508, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: "Infinite MITM loop detected", type: "mitm_loop_error" } }));
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

    // Pass through non-chat and non-model-discovery traffic (telemetry, auth, experiments, etc.)
    const isChat = isChatRequest(tool, req);
    const isModelDisc = isModelDiscoveryRequest(tool, req);

    if (!isChat && !isModelDisc) {
      return passthroughHttps(req, res, bodyBuffer);
    }

    if (isModelDisc) {
      const augmentEnabled = MitmRepository.getToolAugmentModels(tool);
      if (!augmentEnabled) {
        return passthroughHttps(req, res, bodyBuffer);
      }
      const handler = MitmHandlerRegistry.get(tool);
      if (handler) {
        return await handler.handle({
          req,
          res,
          bodyBuffer,
          mappedModel: null,
          isModelDiscovery: true,
          passthrough: passthroughHttps,
        });
      }
      return passthroughHttps(req, res, bodyBuffer);
    }

    // Cursor uses binary proto — delegate directly to Cursor handler
    if (tool === "cursor") {
      const cursorHandler = MitmHandlerRegistry.get("cursor");
      if (cursorHandler) {
        return await cursorHandler.handle({
          req,
          res,
          bodyBuffer,
          mappedModel: null,
          passthrough: passthroughHttps,
        });
      }
      return passthroughHttps(req, res, bodyBuffer);
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

    const handler = MitmHandlerRegistry.get(tool);
    if (handler) {
      await handler.handle({
        req,
        res,
        bodyBuffer,
        mappedModel,
        passthrough: passthroughHttps,
      });
    } else {
      await passthroughHttps(req, res, bodyBuffer);
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

  public async stop(options: { keepDns?: boolean } = {}): Promise<void> {
    if (!options.keepDns) {
      removeAllDNSEntriesSync();
    }
    return new Promise((resolve) => {
      if (this.server) {
        try {
          (this.server as any).closeAllConnections?.();
        } catch {
          // ignore
        }
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

// Clean up DNS entries on unexpected process exit (skip during server restart)
let shutdownHookRegistered = false;
if (!shutdownHookRegistered) {
  shutdownHookRegistered = true;
  const onExit = () => {
    if (process.env.MAPIGATE_RESTARTING === "1") {
      return;
    }
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
