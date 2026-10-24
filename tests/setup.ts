import path from "node:path";
import fs from "node:fs";

export function ensureTestEnvironment(): string {
  process.env.NODE_ENV = "test";
  process.env.MAPIGATE_TEST = "1";

  // In test mode, write files to ./.mapigate in the workspace rather than ~/.mapigate
  if (!process.env.MAPIGATE_DATA_DIR) {
    const workspaceDataDir = path.resolve(process.cwd(), ".mapigate");
    if (!fs.existsSync(workspaceDataDir)) {
      fs.mkdirSync(workspaceDataDir, { recursive: true });
    }
    process.env.MAPIGATE_DATA_DIR = workspaceDataDir;
  }

  return process.env.MAPIGATE_DATA_DIR;
}

// Auto-run when imported
ensureTestEnvironment();
