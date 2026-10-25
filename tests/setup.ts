import path from "node:path";
import fs from "node:fs";

export function ensureTestEnvironment(): string {
  process.env.NODE_ENV = "test";
  process.env.MAPIGATE_TEST = "1";

  // In test mode, write files to ./.mapigate-test in the workspace rather than dev .mapigate or ~/.mapigate
  if (!process.env.MAPIGATE_DATA_DIR) {
    const testDataDir = path.resolve(process.cwd(), ".mapigate-test");
    if (!fs.existsSync(testDataDir)) {
      fs.mkdirSync(testDataDir, { recursive: true });
    }
    process.env.MAPIGATE_DATA_DIR = testDataDir;
  }

  return process.env.MAPIGATE_DATA_DIR;
}

// Auto-run when imported
ensureTestEnvironment();
