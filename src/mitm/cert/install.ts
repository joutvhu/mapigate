import fs from "node:fs";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { ROOT_CA_CERT_PATH, ROOT_CA_CN, getCertFingerprint } from "./rootCA.js";
import { runElevatedPowerShell, isAdmin } from "../dns/winElevated.js";
import { execWithPassword } from "../dns/dnsConfig.js";

const execAsync = promisify(exec);

export function getInstallCommand(certPath: string = ROOT_CA_CERT_PATH): { windows: string; mac: string; linux: string } {
  return {
    windows: `certutil -addstore Root "${certPath}"`,
    mac: `sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain "${certPath}"`,
    linux: `sudo cp "${certPath}" /usr/local/share/ca-certificates/mapigate-rootCA.crt && sudo update-ca-certificates`,
  };
}

export function getUninstallCommand(certPath: string = ROOT_CA_CERT_PATH): { windows: string; mac: string; linux: string } {
  const fingerprint = getCertFingerprint(certPath).replace(/:/g, "") || "<fingerprint>";
  return {
    windows: `certutil -delstore -user Root ${fingerprint}`,
    mac: `sudo security delete-certificate -Z ${fingerprint} /Library/Keychains/System.keychain`,
    linux: `sudo rm -f /usr/local/share/ca-certificates/mapigate-rootCA.crt && sudo update-ca-certificates --fresh`,
  };
}

export async function checkCertInstalled(certPath: string = ROOT_CA_CERT_PATH): Promise<boolean> {
  if (!fs.existsSync(certPath)) return false;

  const fingerprint = getCertFingerprint(certPath).replace(/:/g, "");
  if (!fingerprint) return false;

  const platform = process.platform;
  if (platform === "win32") {
    try {
      // Check machine root store first (for Electron IDEs)
      await execAsync(`certutil -store Root ${fingerprint}`, { windowsHide: true });
      return true;
    } catch {
      try {
        // Fallback to user root store
        await execAsync(`certutil -store -user Root ${fingerprint}`, { windowsHide: true });
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
      // Install Root CA to Machine-Level store (LocalMachine\Root) so background Electron IDE processes trust it
      if (isAdmin()) {
        await execAsync(`certutil -addstore Root "${certPath}"`, { windowsHide: true });
      } else {
        await runElevatedPowerShell(`certutil -addstore Root "${certPath}"`);
      }
      return { success: true, message: "Installed Root CA to Windows LocalMachine Root store successfully" };
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

export async function uninstallCert(
  certPath: string = ROOT_CA_CERT_PATH,
  sudoPassword?: string
): Promise<{ success: boolean; message: string }> {
  const fingerprint = getCertFingerprint(certPath).replace(/:/g, "");
  if (!fingerprint) {
    return { success: false, message: `Could not determine certificate fingerprint for ${certPath}` };
  }

  const platform = process.platform;
  try {
    if (platform === "win32") {
      let removed = false;
      let lastErr = "";
      try {
        await execAsync(`certutil -delstore -user Root ${fingerprint}`, { windowsHide: true });
        removed = true;
      } catch (err: any) {
        lastErr = err.message;
      }

      try {
        if (isAdmin()) {
          await execAsync(`certutil -delstore Root ${fingerprint}`, { windowsHide: true });
          removed = true;
        } else if (!removed) {
          await runElevatedPowerShell(`certutil -delstore Root ${fingerprint}`);
          removed = true;
        }
      } catch (err: any) {
        if (!removed) lastErr = err.message;
      }

      if (!removed) {
        return { success: false, message: `Failed to remove certificate from Windows stores: ${lastErr}` };
      }
      return { success: true, message: "Uninstalled Root CA from Windows Root store successfully" };
    } else if (platform === "darwin") {
      const cmd = `security delete-certificate -Z ${fingerprint} /Library/Keychains/System.keychain`;
      await execWithPassword(cmd, sudoPassword);
      return { success: true, message: "Uninstalled Root CA from macOS keychain" };
    } else {
      const cmd = `rm -f /usr/local/share/ca-certificates/mapigate-rootCA.crt && update-ca-certificates --fresh`;
      await execWithPassword(cmd, sudoPassword);
      return { success: true, message: "Uninstalled Root CA from Linux ca-certificates" };
    }
  } catch (error: any) {
    return { success: false, message: error?.message || "Failed to uninstall certificate" };
  }
}
