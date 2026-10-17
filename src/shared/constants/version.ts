import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function getPackageVersion(): string {
  try {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const rootPkgPath = path.resolve(currentDir, "../../../package.json");
    if (fs.existsSync(rootPkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(rootPkgPath, "utf8"));
      if (pkg.version) {
        return pkg.version;
      }
    }

    let dir = currentDir;
    while (dir && dir !== path.dirname(dir)) {
      const candidate = path.join(dir, "package.json");
      if (fs.existsSync(candidate)) {
        const pkg = JSON.parse(fs.readFileSync(candidate, "utf8"));
        if (pkg.name === "mapigate" && pkg.version) {
          return pkg.version;
        }
      }
      dir = path.dirname(dir);
    }
  } catch {
    // Fail gracefully
  }

  return "0.0.0";
}

export const APP_VERSION = getPackageVersion();
