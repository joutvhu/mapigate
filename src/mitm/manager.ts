import fs from "node:fs";
import { mitmServerInstance } from "./server.js";
import { ROOT_CA_CERT_PATH, ROOT_CA_KEY_PATH, getCertFingerprint, generateRootCA } from "./cert/rootCA.js";
import { checkCertInstalled, installCert, uninstallCert, getInstallCommand, getUninstallCommand } from "./cert/install.js";
import { MitmRepository } from "../storage/repositories/mitmRepo.js";
import { checkAllDNSStatus, removeAllDNSEntries, removeAllDNSEntriesSync } from "./dns/dnsConfig.js";
import {
  inspectPortOwner,
  killProcessByPid,
  checkPortFree,
  PortConflictError,
  type PortOwnerInfo,
} from "./portConflict.js";
import { getMapigateBaseUrl } from "../shared/constants/cliTools.js";

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
    const uninstallCommands = getUninstallCommand(ROOT_CA_CERT_PATH);

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
      uninstallCommands,
      dnsStatus: mergedDnsStatus,
      routerBaseUrl: getMapigateBaseUrl(),
    };
  }

  public async startServer(options?: { port?: number; forceKill?: boolean } | number): Promise<number> {
    const opts = typeof options === "number" ? { port: options } : (options || {});
    const targetPort =
      opts.port !== undefined
        ? opts.port
        : (Number(process.env.MAPIGATE_MITM_PORT) || 443);

    if (isNaN(targetPort) || !Number.isInteger(targetPort) || targetPort < 1 || targetPort > 65535) {
      throw new Error(`Invalid port: ${targetPort}. Port must be an integer between 1 and 65535.`);
    }

    try {
      // Pre-flight check: is port already occupied?
      const portOwner = await inspectPortOwner(targetPort);
      if (portOwner.inUse) {
        if (opts.forceKill && !portOwner.isSystemProcess && portOwner.pid && portOwner.pid > 4) {
          console.log(
            `[MITM] Terminating process occupying port ${targetPort} (PID ${portOwner.pid}, name=${portOwner.processName})...`
          );
          await killProcessByPid(portOwner.pid, true, portOwner.processName);

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

      const activePort = await mitmServerInstance.start(targetPort);
      if (activePort > 0) {
        MitmRepository.setMitmServerRunning(true);
      }
      return activePort;
    } catch (err: any) {
      MitmRepository.setMitmServerRunning(false);
      try {
        await this.removeAllDns();
      } catch {
        this.cleanupDnsSync();
      }
      if (err instanceof PortConflictError || err.name === "PortConflictError") {
        throw err;
      }
      const postInspect = await inspectPortOwner(targetPort);
      const errorCode = postInspect.isSystemProcess ? "PORT_443_SYSTEM" : "PORT_443_BUSY";
      throw new PortConflictError(
        `Failed to bind port ${targetPort}: ${err.message}`,
        errorCode,
        postInspect.inUse ? postInspect : { port: targetPort, inUse: true }
      );
    }
  }

  public async removeAllDns(sudoPassword?: string): Promise<void> {
    await removeAllDNSEntries(sudoPassword);
  }

  public async stopServer(options: { keepDns?: boolean } = {}) {
    if (!options.keepDns) {
      try {
        await this.removeAllDns();
      } catch {
        this.cleanupDnsSync();
      }
      MitmRepository.setMitmServerRunning(false);
    }
    await mitmServerInstance.stop(options);
  }

  public async installCertificate() {
    if (!fs.existsSync(ROOT_CA_CERT_PATH)) {
      generateRootCA();
    }
    return installCert(ROOT_CA_CERT_PATH);
  }

  public async uninstallCertificate(sudoPassword?: string) {
    return uninstallCert(ROOT_CA_CERT_PATH, sudoPassword);
  }

  public cleanupDnsSync() {
    removeAllDNSEntriesSync();
  }
}

export const mitmManager = MitmManager.getInstance();
