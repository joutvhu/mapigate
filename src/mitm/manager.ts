import fs from "node:fs";
import { mitmServerInstance } from "./server.js";
import { ROOT_CA_CERT_PATH, ROOT_CA_KEY_PATH, getCertFingerprint, generateRootCA } from "./cert/rootCA.js";
import { checkCertInstalled, installCert, uninstallCert, getInstallCommand, getUninstallCommand } from "./cert/install.js";
import { MitmRepository } from "../storage/repositories/mitmRepo.js";
import {
  checkAllDNSStatus,
  addMultipleDNSEntries,
  removeAllDNSEntries,
  removeAllDNSEntriesSync,
} from "./dns/dnsConfig.js";
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
  private lastDnsWarning: string | null = null;

  public static getInstance(): MitmManager {
    if (!MitmManager.instance) {
      MitmManager.instance = new MitmManager();
    }
    return MitmManager.instance;
  }

  public getLastDnsWarning(): string | null {
    return this.lastDnsWarning;
  }

  public clearLastDnsWarning(): void {
    this.lastDnsWarning = null;
  }

  public async getStatus() {
    const certExists = fs.existsSync(ROOT_CA_CERT_PATH) && fs.existsSync(ROOT_CA_KEY_PATH);
    const serverStatus = mitmServerInstance.getStatus();
    const certTrusted = certExists ? await checkCertInstalled(ROOT_CA_CERT_PATH) : false;
    const fingerprint = certExists ? getCertFingerprint(ROOT_CA_CERT_PATH) : "";
    const installCommands = getInstallCommand(ROOT_CA_CERT_PATH);
    const uninstallCommands = getUninstallCommand(ROOT_CA_CERT_PATH);

    const liveDns = this.checkLiveDns();
    const orphanedDns = !serverStatus.running && Object.values(liveDns).some(Boolean);

    return {
      running: serverStatus.running,
      port: serverStatus.port,
      certExists,
      certTrusted,
      certPath: ROOT_CA_CERT_PATH,
      fingerprint,
      installCommands,
      uninstallCommands,
      dnsStatus: liveDns,
      orphanedDns,
      routerBaseUrl: getMapigateBaseUrl(),
    };
  }

  public async startServer(options?: { port?: number; forceKill?: boolean; sudoPassword?: string } | number): Promise<number> {
    const opts = typeof options === "number" ? { port: options } : (options || {});
    const targetPort =
      opts.port !== undefined
        ? opts.port
        : (Number(process.env.MAPIGATE_MITM_PORT) || 443);

    if (isNaN(targetPort) || !Number.isInteger(targetPort) || targetPort < 1 || targetPort > 65535) {
      throw new Error(`Invalid port: ${targetPort}. Port must be an integer between 1 and 65535.`);
    }

    try {
      if (mitmServerInstance.getStatus().running && mitmServerInstance.getStatus().port === targetPort) {
        return targetPort;
      }

      // Pre-flight check: is port already occupied?
      const portOwner = await inspectPortOwner(targetPort);
      if (portOwner.inUse) {
        const isTimeWait = portOwner.pid === 0 || Boolean(portOwner.processName?.toLowerCase().includes("idle"));
        if (portOwner.pid === process.pid || isTimeWait) {
          // Port is held by this Mapigate process or in transient TCP TIME_WAIT from a recent restart.
          // Polling to let socket release cleanly.
          let released = false;
          for (let i = 0; i < 20; i++) {
            if (await checkPortFree(targetPort)) {
              released = true;
              break;
            }
            await new Promise((r) => setTimeout(r, 200));
          }
          if (!released) {
            if (mitmServerInstance.getStatus().running) {
              return targetPort;
            }
            throw new PortConflictError(
              isTimeWait
                ? `Port ${targetPort} is currently in a transient socket release state (TIME_WAIT). Please wait a moment and click Retry.`
                : `Port ${targetPort} is held by this Mapigate process and is still releasing. Please wait a moment.`,
              "PORT_443_BUSY",
              { ...portOwner, isSystemProcess: false }
            );
          }
        } else if (opts.forceKill && !portOwner.isSystemProcess && portOwner.pid && portOwner.pid > 4) {
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

      this.lastDnsWarning = null;
      const activePort = await mitmServerInstance.start(targetPort);
      if (activePort > 0) {
        MitmRepository.setMitmServerRunning(true);
        try {
          await this.syncDnsOnStart(opts.sudoPassword);
        } catch (dnsErr: any) {
          console.warn(`[MITM] DNS sync on start failed: ${dnsErr.message}`);
          this.lastDnsWarning = dnsErr.message || "Failed to update hosts file";
        }
      }
      return activePort;
    } catch (err: any) {
      MitmRepository.setMitmServerRunning(false);
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

  /**
   * Reconcile tool DNS entries when MITM server starts.
   * Modifies hosts file IF and ONLY IF:
   * 1. MITM proxy is running;
   * 2. Tools were previously marked active in SQLite settings;
   * 3. Those tool entries are currently missing in the live hosts file.
   * If all conditions are met, restores missing tools in a single batched write.
   */
  public async syncDnsOnStart(
    sudoPassword?: string
  ): Promise<{ restored: string[]; skipped: string[] }> {
    const status = mitmServerInstance.getStatus();
    if (!status.running) {
      return { restored: [], skipped: [] };
    }

    const repoDns = MitmRepository.getAllToolDnsStatus();
    const liveDns = this.checkLiveDns();

    const toolsToRestore: string[] = [];
    const skipped: string[] = [];

    for (const [tool, isEnabledInRepo] of Object.entries(repoDns)) {
      if (!isEnabledInRepo) {
        continue;
      }
      if (liveDns[tool as keyof typeof liveDns]) {
        skipped.push(tool);
      } else {
        toolsToRestore.push(tool);
      }
    }

    if (toolsToRestore.length > 0) {
      await this.addMultipleDns(toolsToRestore, sudoPassword);
    }

    return { restored: toolsToRestore, skipped };
  }

  public async restoreDnsOnStartup(
    sudoPassword?: string
  ): Promise<{ restored: string[]; skipped: string[] }> {
    return this.syncDnsOnStart(sudoPassword);
  }

  public checkLiveDns(): Record<string, boolean> {
    return checkAllDNSStatus();
  }

  public async addMultipleDns(tools: string[], sudoPassword?: string): Promise<void> {
    await addMultipleDNSEntries(tools, sudoPassword);
  }

  public async removeAllDns(sudoPassword?: string): Promise<void> {
    await removeAllDNSEntries(sudoPassword);
  }

  public async stopServer(options: { keepDns?: boolean; sudoPassword?: string; keepPersistedState?: boolean } = {}) {
    this.lastDnsWarning = null;
    if (!options.keepDns) {
      try {
        await this.removeAllDns(options.sudoPassword);
      } catch (err: any) {
        console.warn(`[MITM] Async DNS removal failed, falling back to sync: ${err.message}`);
        this.cleanupDnsSync();
      }
    }
    if (!options.keepPersistedState) {
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
