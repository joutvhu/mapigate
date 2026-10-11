import fs from "node:fs";
import { mitmServerInstance } from "./server.js";
import { ROOT_CA_CERT_PATH, ROOT_CA_KEY_PATH, getCertFingerprint, generateRootCA } from "./cert/rootCA.js";
import { checkCertInstalled, installCert, getInstallCommand } from "./cert/install.js";
import { MitmRepository } from "../storage/repositories/mitmRepo.js";
import { checkAllDNSStatus, removeAllDNSEntriesSync } from "./dns/dnsConfig.js";
import {
  inspectPortOwner,
  killProcessByPid,
  checkPortFree,
  PortConflictError,
  type PortOwnerInfo,
} from "./portConflict.js";

export class MitmManager {
  private static instance: MitmManager;

  public static getInstance(): MitmManager {
    if (!MitmManager.instance) {
      MitmManager.instance = new MitmManager();
    }
    return MitmManager.instance;
  }

  public async getStatus() {
    const certExists = fs.existsSync(ROOT_CA_CERT_PATH) && fs.existsSync(ROOT_CA_KEY_PATH);
    const serverStatus = mitmServerInstance.getStatus();
    const certTrusted = certExists ? await checkCertInstalled(ROOT_CA_CERT_PATH) : false;
    const fingerprint = certExists ? getCertFingerprint(ROOT_CA_CERT_PATH) : "";
    const installCommands = getInstallCommand(ROOT_CA_CERT_PATH);

    // Merge repo state with live /etc/hosts file entries
    const repoDns = MitmRepository.getAllToolDnsStatus();
    const liveDns = checkAllDNSStatus();
    const mergedDnsStatus: Record<string, boolean> = {
      ...repoDns,
      ...liveDns,
    };

    return {
      running: serverStatus.running,
      port: serverStatus.port,
      certExists,
      certTrusted,
      certPath: ROOT_CA_CERT_PATH,
      fingerprint,
      installCommands,
      dnsStatus: mergedDnsStatus,
      routerBaseUrl: "http://127.0.0.1:20127",
    };
  }

  public async startServer(options?: { port?: number; forceKill?: boolean } | number): Promise<number> {
    const opts = typeof options === "number" ? { port: options } : (options || {});
    const targetPort = opts.port || Number(process.env.MAPIGATE_MITM_PORT) || 443;

    // Pre-flight check: is port already occupied?
    const portOwner = await inspectPortOwner(targetPort);
    if (portOwner.inUse) {
      if (opts.forceKill && !portOwner.isSystemProcess && portOwner.pid && portOwner.pid > 4) {
        console.log(
          `[MITM] Terminating process occupying port ${targetPort} (PID ${portOwner.pid}, name=${portOwner.processName})...`
        );
        await killProcessByPid(portOwner.pid, true);

        // Polling briefly to confirm port is released
        let released = false;
        for (let i = 0; i < 10; i++) {
          if (await checkPortFree(targetPort)) {
            released = true;
            break;
          }
          await new Promise((r) => setTimeout(r, 200));
        }

        if (!released) {
          throw new PortConflictError(
            `Port ${targetPort} remains occupied after attempting to terminate process (PID ${portOwner.pid}).`,
            "PORT_443_BUSY",
            portOwner
          );
        }
      } else {
        const errorCode = portOwner.isSystemProcess ? "PORT_443_SYSTEM" : "PORT_443_BUSY";
        const errorMsg = portOwner.isSystemProcess
          ? `Port ${targetPort} is occupied by Windows system service "${portOwner.processName}" (PID ${portOwner.pid || 4}).`
          : `Port ${targetPort} is already in use by "${portOwner.processName || "unknown"}" (PID ${portOwner.pid || "unknown"}).`;
        throw new PortConflictError(errorMsg, errorCode, portOwner);
      }
    }

    try {
      const activePort = await mitmServerInstance.start(targetPort);
      if (activePort > 0) {
        MitmRepository.setMitmServerRunning(true);
      }
      return activePort;
    } catch (err: any) {
      MitmRepository.setMitmServerRunning(false);
      const postInspect = await inspectPortOwner(targetPort);
      const errorCode = postInspect.isSystemProcess ? "PORT_443_SYSTEM" : "PORT_443_BUSY";
      throw new PortConflictError(
        `Failed to bind port ${targetPort}: ${err.message}`,
        errorCode,
        postInspect.inUse ? postInspect : { port: targetPort, inUse: true }
      );
    }
  }

  public async stopServer() {
    await mitmServerInstance.stop();
    MitmRepository.setMitmServerRunning(false);
  }

  public async installCertificate() {
    if (!fs.existsSync(ROOT_CA_CERT_PATH)) {
      generateRootCA();
    }
    return installCert(ROOT_CA_CERT_PATH);
  }

  public cleanupDnsSync() {
    removeAllDNSEntriesSync();
  }
}

export const mitmManager = MitmManager.getInstance();
