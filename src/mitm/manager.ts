import fs from "node:fs";
import { mitmServerInstance } from "./server.js";
import { ROOT_CA_CERT_PATH, ROOT_CA_KEY_PATH, getCertFingerprint, generateRootCA } from "./cert/rootCA.js";
import { checkCertInstalled, installCert, getInstallCommand } from "./cert/install.js";
import { MitmRepository } from "../storage/repositories/mitmRepo.js";

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

    return {
      running: serverStatus.running,
      port: serverStatus.port,
      certExists,
      certTrusted,
      certPath: ROOT_CA_CERT_PATH,
      fingerprint,
      installCommands,
      dnsStatus: MitmRepository.getAllToolDnsStatus(),
      routerBaseUrl: "http://127.0.0.1:20127",
    };
  }

  public async startServer(port?: number) {
    const activePort = await mitmServerInstance.start(port);
    if (activePort > 0) {
      MitmRepository.setMitmServerRunning(true);
    }
    return activePort;
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
}

export const mitmManager = MitmManager.getInstance();
