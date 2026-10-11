import https from "node:https";
import tls from "node:tls";
import fs from "node:fs";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { ROOT_CA_KEY_PATH, ROOT_CA_CERT_PATH, generateRootCA } from "./cert/rootCA.js";
import { getCertForDomain } from "./cert/generate.js";
import { interceptAntigravity } from "./handlers/antigravity.js";
import { interceptKiro } from "./handlers/kiro.js";
import { interceptCopilot } from "./handlers/copilot.js";
import { MitmRepository } from "../storage/repositories/mitmRepo.js";

const DEFAULT_PRIMARY_PORT = 443;
const DEFAULT_FALLBACK_PORT = 8443;

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

function resolveModelMapping(tool: string, incomingModel?: string): string {
  const mappings = MitmRepository.getMappings(tool);
  if (!incomingModel) {
    return mappings[0]?.targetModel || "claude-sonnet-4-6";
  }

  // Exact match
  const exact = mappings.find(
    (m) => m.sourceModel.toLowerCase() === incomingModel.toLowerCase()
  );
  if (exact) return exact.targetModel;

  // Prefix match
  const prefix = mappings.find(
    (m) =>
      incomingModel.toLowerCase().startsWith(m.sourceModel.toLowerCase()) ||
      m.sourceModel.toLowerCase().startsWith(incomingModel.toLowerCase())
  );
  if (prefix) return prefix.targetModel;

  return mappings[0]?.targetModel || incomingModel;
}

function identifyTool(host: string = ""): "antigravity" | "kiro" | "copilot" | null {
  const cleanHost = host.split(":")[0].toLowerCase();
  if (cleanHost.includes("cloudcode-pa.googleapis.com")) return "antigravity";
  if (cleanHost.includes("kiro.dev")) return "kiro";
  if (cleanHost.includes("githubcopilot.com")) return "copilot";
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
  const host = req.headers.host || "";
  const tool = identifyTool(host);

  if (!tool) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: `Host ${host} not recognized by Routen MITM Proxy` }));
    return;
  }

  const dnsActive = MitmRepository.getToolDnsStatus(tool);
  if (!dnsActive) {
    // If DNS redirection is turned off for this tool, return warning
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: `DNS interception for ${tool} is currently disabled in Routen` }));
    return;
  }

  try {
    const bodyBuffer = await collectBody(req);
    let incomingModel: string | undefined;

    try {
      const parsed = JSON.parse(bodyBuffer.toString("utf-8"));
      incomingModel = parsed.model || parsed.conversationState?.currentMessage?.userInputMessage?.model;
    } catch {
      // Body might be non-JSON
    }

    const mappedModel = resolveModelMapping(tool, incomingModel);

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
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
    }
    res.end(JSON.stringify({ error: error?.message || "Internal MITM Proxy Error" }));
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

    return new Promise((resolve) => {
      const tryListen = (portToTry: number) => {
        const srv = https.createServer(sslOptions, (req, res) => {
          handleMitmRequest(req, res);
        });

        srv.on("error", (err: any) => {
          if ((err.code === "EACCES" || err.code === "EADDRINUSE") && portToTry === DEFAULT_PRIMARY_PORT) {
            console.log(`[MITM] Port 443 unavailable (${err.code}), falling back to ${DEFAULT_FALLBACK_PORT}`);
            tryListen(DEFAULT_FALLBACK_PORT);
          } else {
            console.error(`[MITM] Server error on port ${portToTry}:`, err.message);
            this.running = false;
            resolve(0);
          }
        });

        srv.listen(portToTry, "0.0.0.0", () => {
          this.server = srv;
          this.port = portToTry;
          this.running = true;
          console.log(`[MITM] HTTPS Proxy server running on port ${portToTry}`);
          resolve(portToTry);
        });
      };

      tryListen(preferredPort);
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
