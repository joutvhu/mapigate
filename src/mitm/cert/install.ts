import fs from "node:fs";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { ROOT_CA_CERT_PATH, ROOT_CA_CN, getCertFingerprint } from "./rootCA.js";

const execAsync = promisify(exec);

export function getInstallCommand(certPath: string = ROOT_CA_CERT_PATH): { windows: string; mac: string; linux: string } {
  return {
    windows: `certutil -addstore -user "Root" "${certPath}"`,
    mac: `sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain "${certPath}"`,
    linux: `sudo cp "${certPath}" /usr/local/share/ca-certificates/mapigate-rootCA.crt && sudo update-ca-certificates`,
  };
}

export async function checkCertInstalled(certPath: string = ROOT_CA_CERT_PATH): Promise<boolean> {
  if (!fs.existsSync(certPath)) return false;

  const fingerprint = getCertFingerprint(certPath).replace(/:/g, "");
  if (!fingerprint) return false;

  const platform = process.platform;
  if (platform === "win32") {
    try {
      // Check user root or system root store
      await execAsync(`certutil -store -user Root ${fingerprint}`, { windowsHide: true });
      return true;
    } catch {
      try {
        await execAsync(`certutil -store Root ${fingerprint}`, { windowsHide: true });
        return true;
      } catch {
        return false;
      }
    }
  } else if (platform === "darwin") {
    try {
      const { stdout } = await execAsync(
        `security find-certificate -a -c "${ROOT_CA_CN}" -Z /Library/Keychains/System.keychain 2>/dev/null`,
        { windowsHide: true }
      );
      return new RegExp(`SHA-1 hash:\\s*${fingerprint}`, "i").test(stdout);
    } catch {
      return false;
    }
  } else {
    // Linux check
    try {
      return (
        fs.existsSync("/usr/local/share/ca-certificates/mapigate-rootCA.crt")
      );
    } catch {
      return false;
    }
  }
}

export async function installCert(certPath: string = ROOT_CA_CERT_PATH): Promise<{ success: boolean; message: string }> {
  if (!fs.existsSync(certPath)) {
    return { success: false, message: `Cert file not found at ${certPath}` };
  }

  const platform = process.platform;
  try {
    if (platform === "win32") {
      // Install to user store (does NOT require elevated UAC)
      await execAsync(`certutil -addstore -user "Root" "${certPath}"`, { windowsHide: true });
      return { success: true, message: "Installed Root CA to Windows User Root store successfully" };
    } else if (platform === "darwin") {
      const cmd = `security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain "${certPath}"`;
      await execAsync(cmd, { windowsHide: true });
      return { success: true, message: "Installed Root CA to macOS keychain" };
    } else {
      await execAsync(`cp "${certPath}" /usr/local/share/ca-certificates/mapigate-rootCA.crt && update-ca-certificates`, { windowsHide: true });
      return { success: true, message: "Installed Root CA to Linux ca-certificates" };
    }
  } catch (error: any) {
    return { success: false, message: error?.message || "Failed to install certificate automatically. Please run the command manually." };
  }
}
