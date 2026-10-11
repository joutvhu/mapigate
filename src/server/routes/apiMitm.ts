import { Router } from "express";
import fs from "node:fs";
import { MitmRepository } from "../../storage/repositories/mitmRepo.js";
import { mitmManager } from "../../mitm/manager.js";
import { ROOT_CA_CERT_PATH } from "../../mitm/cert/rootCA.js";
import {
  addDNSEntry,
  removeDNSEntry,
  checkAllDNSStatus,
} from "../../mitm/dns/dnsConfig.js";
import { type MitmToolId } from "../../shared/constants/mitmToolHosts.js";
import {
  inspectPortOwner,
  PortConflictError,
  type PortOwnerInfo,
} from "../../mitm/portConflict.js";

export const mitmRouter = Router();

// GET MITM status
mitmRouter.get("/status", async (_req, res) => {
  try {
    const status = await mitmManager.getStatus();
    res.json(status);
  } catch (error: any) {
    res.json({
      running: MitmRepository.getMitmServerRunning(),
      certExists: true,
      certTrusted: true,
      serverOk: true,
      dnsStatus: {
        ...MitmRepository.getAllToolDnsStatus(),
        ...checkAllDNSStatus(),
      },
      routerBaseUrl: "http://127.0.0.1:20127",
    });
  }
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

// GET port owner status
mitmRouter.get("/port-status", async (req, res) => {
  try {
    const rawPort = req.query.port;
    const port = rawPort ? Number(rawPort) : 443;
    if (isNaN(port) || port <= 0 || port > 65535) {
      res.status(400).json({ error: "Invalid port number" });
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
      const portOption = req.body.port ? Number(req.body.port) : undefined;
      const forceKill = Boolean(req.body.forceKill);
      const port = await mitmManager.startServer({ port: portOption, forceKill });
      res.json({ running: port > 0, port });
    } else {
      await mitmManager.stopServer();
      res.json({ running: false, port: 0 });
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

  MitmRepository.setToolDnsStatus(toolKey, newStatus);
  const liveDns = checkAllDNSStatus();
  const allDnsStatus = { ...MitmRepository.getAllToolDnsStatus(), ...liveDns };

  res.json({
    tool: toolKey,
    ide: toolKey,
    active: newStatus,
    dnsStatus: allDnsStatus,
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

mitmRouter.post("/hosts/:tool", (req, res) => {
  const { tool } = req.params;
  const { entries } = req.body;
  if (typeof entries === "string") {
    MitmRepository.saveToolHosts(tool, entries);
  }
  res.json({ success: true, tool, entries: MitmRepository.getToolHosts(tool) });
});

// Legacy backward-compatible hosts endpoints
mitmRouter.get("/hosts", (_req, res) => {
  const entries = MitmRepository.getHostsEntries();
  res.json({ entries });
});

mitmRouter.post("/hosts", (req, res) => {
  const { entries } = req.body;
  if (typeof entries === "string") {
    MitmRepository.saveHostsEntries(entries);
  }
  res.json({ success: true, entries: MitmRepository.getHostsEntries() });
});

mitmRouter.post("/hosts/reset", (_req, res) => {
  const entries = MitmRepository.resetHostsEntries();
  res.json({ success: true, entries });
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
