import { Router } from "express";
import fs from "node:fs";
import { MitmRepository } from "../../storage/repositories/mitmRepo.js";
import { mitmManager } from "../../mitm/manager.js";
import { getSuggestedSourceModels } from "../../mitm/sourceModels.js";
import { ROOT_CA_CERT_PATH } from "../../mitm/cert/rootCA.js";
import {
  addDNSEntry,
  removeDNSEntry,
  checkAllDNSStatus,
} from "../../mitm/dns/dnsConfig.js";
import { TOOL_HOSTS, type MitmToolId } from "../../shared/constants/mitmToolHosts.js";
import {
  inspectPortOwner,
  PortConflictError,
} from "../../mitm/portConflict.js";
import {
  getCurrentRouterTarget,
  testRouterTargetConnection,
  fetchRemoteModels,
} from "./mitmRouterTargetHelper.js";

import { getMapigateBaseUrl } from "../../shared/constants/cliTools.js";
import { serverLifecycle } from "../lifecycle.js";

export const mitmRouter = Router();

// GET MITM router target
mitmRouter.get("/router-target", (_req, res) => {
  res.json(getCurrentRouterTarget());
});

// PUT MITM router target
mitmRouter.put("/router-target", async (req, res) => {
  const status = await mitmManager.getStatus();
  if (status.running) {
    res.status(400).json({ error: "Cannot modify router target while MITM server is running. Please stop the server first." });
    return;
  }

  const { baseUrl, apiKey } = req.body || {};

  if (baseUrl !== undefined && typeof baseUrl !== "string") {
    res.status(400).json({ error: "baseUrl must be a string" });
    return;
  }

  if (baseUrl) {
    try {
      const parsed = new URL(baseUrl.trim());
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        res.status(400).json({ error: "URL protocol must be http: or https:" });
        return;
      }
    } catch {
      res.status(400).json({ error: "Invalid URL format" });
      return;
    }
  }

  MitmRepository.setRouterTarget({
    baseUrl: baseUrl !== undefined ? baseUrl : undefined,
    apiKey: apiKey !== undefined ? apiKey : undefined,
  });

  res.json({
    success: true,
    ...getCurrentRouterTarget(),
  });
});

// POST test MITM router target connection
mitmRouter.post("/router-target/test", async (req, res) => {
  const { baseUrl, apiKey } = req.body || {};
  const result = await testRouterTargetConnection(baseUrl, apiKey);
  res.json(result);
});

// GET remote models when configured
mitmRouter.get("/router-target/models", async (_req, res) => {
  const models = await fetchRemoteModels();
  res.json({ models });
});

// GET MITM status
mitmRouter.get("/status", async (_req, res) => {
  try {
    const status = await mitmManager.getStatus();
    res.json({
      ...status,
      augmentModels: MitmRepository.getAllToolAugmentModels(),
    });
  } catch {
    res.json({
      running: MitmRepository.getMitmServerRunning(),
      certExists: true,
      certTrusted: true,
      serverOk: true,
      dnsStatus: checkAllDNSStatus(),
      routerBaseUrl: getMapigateBaseUrl(serverLifecycle.getPort()),
      augmentModels: MitmRepository.getAllToolAugmentModels(),
    });
  }
});

// GET augment models status across all tools
mitmRouter.get("/augment-models", (_req, res) => {
  res.json(MitmRepository.getAllToolAugmentModels());
});

mitmRouter.get("/augment-models/:tool", (req, res) => {
  const { tool } = req.params;
  const enabled = MitmRepository.getToolAugmentModels(tool);
  res.json({ tool, enabled });
});

// POST toggle augment models for a tool
mitmRouter.post("/augment-models", (req, res) => {
  const { tool, enabled } = req.body || {};
  if (!tool || typeof tool !== "string") {
    res.status(400).json({ error: "Missing required tool parameter" });
    return;
  }
  const current = MitmRepository.getToolAugmentModels(tool);
  const next = enabled !== undefined ? Boolean(enabled) : !current;
  MitmRepository.setToolAugmentModels(tool, next);
  res.json({
    success: true,
    tool,
    enabled: next,
    augmentModels: MitmRepository.getAllToolAugmentModels(),
  });
});

// GET download Root CA certificate
mitmRouter.get("/cert", (_req, res) => {
  if (fs.existsSync(ROOT_CA_CERT_PATH)) {
    res.setHeader("Content-Disposition", 'attachment; filename="mapigate-rootCA.crt"');
    res.setHeader("Content-Type", "application/x-x509-ca-cert");
    res.sendFile(ROOT_CA_CERT_PATH);
  } else {
    res.status(404).json({ error: "Root CA certificate not found" });
  }
});

// POST install Root CA certificate
mitmRouter.post("/install-cert", async (_req, res) => {
  try {
    const result = await mitmManager.installCertificate();
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ success: false, message: error?.message || "Failed to install certificate" });
  }
});

// POST uninstall Root CA certificate
mitmRouter.post("/uninstall-cert", async (req, res) => {
  try {
    const sudoPassword = req.body?.sudoPassword;
    const result = await mitmManager.uninstallCertificate(sudoPassword);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ success: false, message: error?.message || "Failed to uninstall certificate" });
  }
});

// GET port owner status
mitmRouter.get("/port-status", async (req, res) => {
  try {
    const rawPort = req.query.port;
    const port = rawPort ? Number(rawPort) : 443;
    if (isNaN(port) || !Number.isInteger(port) || port < 1 || port > 65535) {
      res.status(400).json({ error: "Invalid port number. Port must be an integer between 1 and 65535." });
      return;
    }
    const info = await inspectPortOwner(port);
    res.json(info);
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "Failed to inspect port status" });
  }
});

// POST toggle MITM server
mitmRouter.post("/toggle-server", async (req, res) => {
  try {
    let shouldRun: boolean;
    if (req.body.running !== undefined) {
      shouldRun = Boolean(req.body.running);
    } else {
      const status = await mitmManager.getStatus();
      shouldRun = !status.running;
    }

    if (shouldRun) {
      let portOption: number | undefined;
      if (req.body.port !== undefined && req.body.port !== null && req.body.port !== "") {
        const parsedPort = Number(req.body.port);
        if (isNaN(parsedPort) || !Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
          res.status(400).json({ error: "Invalid port number. Port must be an integer between 1 and 65535." });
          return;
        }
        portOption = parsedPort;
      }
      const forceKill = Boolean(req.body.forceKill);
      const port = await mitmManager.startServer({ port: portOption, forceKill, sudoPassword: req.body.sudoPassword });
      const liveDns = mitmManager.checkLiveDns();
      const warning = mitmManager.getLastDnsWarning();
      res.json({
        running: port > 0,
        port,
        dnsStatus: liveDns,
        ...(warning ? { warning } : {}),
      });
    } else {
      await mitmManager.stopServer({ sudoPassword: req.body.sudoPassword });
      const liveDns = mitmManager.checkLiveDns();
      res.json({ running: false, port: 0, dnsStatus: liveDns });
    }
  } catch (error: any) {
    if (error instanceof PortConflictError || error.name === "PortConflictError") {
      res.status(409).json({
        error: error.message,
        code: error.code || "PORT_443_BUSY",
        portOwner: error.portOwner,
      });
      return;
    }
    res.status(500).json({ error: error?.message || "Failed to toggle server" });
  }
});

// POST toggle DNS redirection for an IDE / tool
mitmRouter.post("/toggle-dns", async (req, res) => {
  const tool = req.body.tool || req.body.ide;
  if (!tool || typeof tool !== "string") {
    res.status(400).json({ error: "Missing tool or ide parameter" });
    return;
  }
  const toolKey = tool.toLowerCase() as MitmToolId;
  const currentStatus = MitmRepository.getToolDnsStatus(toolKey);
  const newStatus = req.body.active !== undefined ? Boolean(req.body.active) : !currentStatus;

  let dnsError: string | null = null;
  MitmRepository.setToolDnsStatus(toolKey, newStatus);

  const mitmStatus = await mitmManager.getStatus();
  if (newStatus && !mitmStatus.running) {
    try {
      await mitmManager.startServer({ sudoPassword: req.body.sudoPassword });
      const lastWarning = mitmManager.getLastDnsWarning();
      if (lastWarning) dnsError = lastWarning;
    } catch (err: any) {
      if (err instanceof PortConflictError || err.name === "PortConflictError") {
        res.status(409).json({
          error: err.message,
          code: err.code || "PORT_443_BUSY",
          portOwner: err.portOwner,
        });
        return;
      }
      console.warn(`[MITM API] Auto-starting MITM server for ${toolKey} failed:`, err.message);
      dnsError = err.message;
    }
  } else {
    try {
      if (newStatus) {
        await addDNSEntry(toolKey, req.body.sudoPassword);
      } else {
        await removeDNSEntry(toolKey, req.body.sudoPassword);
      }
    } catch (err: any) {
      console.warn(`[MITM API] Failed to update hosts file for ${toolKey}:`, err.message);
      dnsError = err.message;
    }
  }

  const liveDns = checkAllDNSStatus();
  if (dnsError && newStatus && !liveDns[toolKey]) {
    MitmRepository.setToolDnsStatus(toolKey, false);
  }

  res.json({
    tool: toolKey,
    ide: toolKey,
    active: Boolean(liveDns[toolKey]),
    dnsStatus: liveDns,
    ...(dnsError && { warning: dnsError }),
  });
});

// Per-tool Hosts endpoints
mitmRouter.post("/hosts/:tool/reset", (req, res) => {
  const { tool } = req.params;
  const entries = MitmRepository.resetToolHosts(tool);
  res.json({ success: true, tool, entries });
});

mitmRouter.get("/hosts/:tool", (req, res) => {
  const { tool } = req.params;
  const entries = MitmRepository.getToolHosts(tool);
  res.json({ tool, entries });
});

function validateHostsContent(tool: string, content: string): { valid: boolean; error?: string } {
  const lines = content.split(/\r?\n/);
  const defaultHosts = TOOL_HOSTS[tool] || [];
  const allowedBaseDomains = defaultHosts.map((h) => {
    const parts = h.split(".");
    return parts.length >= 2 ? parts.slice(-2).join(".") : h;
  });

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    if (!rawLine || rawLine.startsWith("#")) continue;

    const parts = rawLine.split(/\s+/).filter(Boolean);
    if (parts.length < 2) {
      return { valid: false, error: `Invalid syntax on line ${i + 1}: expected '<ip> <hostname>'` };
    }
    const [ip, host] = parts;
    const isLoopback =
      ip === "127.0.0.1" ||
      ip === "::1" ||
      /^127(?:\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}$/.test(ip);

    if (!isLoopback) {
      return {
        valid: false,
        error: `Security violation on line ${i + 1}: Only loopback IP addresses (127.0.0.1, ::1) are permitted`,
      };
    }

    if (!/^[a-zA-Z0-9]([a-zA-Z0-9_.-]*[a-zA-Z0-9])?$/.test(host) || host.includes("..")) {
      return { valid: false, error: `Invalid hostname format on line ${i + 1}: '${host}'` };
    }

    const hostLower = host.toLowerCase();
    const matchesDomain = allowedBaseDomains.some(
      (base) => hostLower === base.toLowerCase() || hostLower.endsWith("." + base.toLowerCase())
    );

    if (!matchesDomain && !defaultHosts.map((h) => h.toLowerCase()).includes(hostLower)) {
      return {
        valid: false,
        error: `Unauthorized host '${host}' on line ${i + 1}: Only domains belonging to ${tool} (${allowedBaseDomains.join(", ")}) may be configured`,
      };
    }
  }

  return { valid: true };
}

mitmRouter.post("/hosts/:tool", (req, res) => {
  const { tool } = req.params;
  const toolKey = (tool || "").toLowerCase();
  if (!TOOL_HOSTS[toolKey]) {
    res.status(400).json({ error: `Unknown or unsupported tool '${tool}'` });
    return;
  }

  const { entries } = req.body || {};
  if (typeof entries !== "string") {
    res.status(400).json({ error: "Missing or invalid 'entries' string parameter" });
    return;
  }

  const validation = validateHostsContent(toolKey, entries);
  if (!validation.valid) {
    res.status(400).json({ error: validation.error });
    return;
  }

  MitmRepository.saveToolHosts(toolKey, entries);
  res.json({ success: true, tool: toolKey, entries: MitmRepository.getToolHosts(toolKey) });
});

// GET suggested source models for an IDE / tool
mitmRouter.get("/mappings/source-models/:ide", (req, res) => {
  const suggestions = getSuggestedSourceModels(req.params.ide);
  res.json(suggestions);
});

// GET mappings for an IDE / tool
mitmRouter.get("/mappings/:ide", (req, res) => {
  const mappings = MitmRepository.getMappings(req.params.ide);
  res.json(mappings);
});

// POST update mapping
mitmRouter.post("/mappings", (req, res) => {
  const { ide, sourceModel, targetModel } = req.body;
  if (!ide || !sourceModel || !targetModel) {
    res.status(400).json({ error: "Missing required mapping fields" });
    return;
  }
  MitmRepository.updateMapping(ide, sourceModel, targetModel);
  res.json({ success: true });
});

// POST reset mappings to default
mitmRouter.post("/mappings/reset", (req, res) => {
  const ide = req.body.ide || req.body.tool || "kiro";
  const mappings = MitmRepository.resetMappings(ide);
  res.json({ success: true, ide, mappings });
});

// DELETE mapping (supports query string, JSON body, or wildcard path for slashes in model IDs)
mitmRouter.delete("/mappings/:ide", (req, res) => {
  const ide = req.params.ide;
  const sourceModel = (req.query.sourceModel as string) || req.body?.sourceModel;
  if (!sourceModel) {
    res.status(400).json({ error: "Missing sourceModel parameter" });
    return;
  }
  MitmRepository.deleteMapping(ide, sourceModel);
  res.json({ success: true });
});

mitmRouter.delete("/mappings/:ide/*", (req, res) => {
  const ide = req.params.ide;
  const sourceModel = (req.params as any)[0] || (req.params as any).sourceModel;
  if (!sourceModel) {
    res.status(400).json({ error: "Missing sourceModel parameter" });
    return;
  }
  MitmRepository.deleteMapping(ide, sourceModel);
  res.json({ success: true });
});
