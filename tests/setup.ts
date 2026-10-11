import os from "node:os";
import path from "node:path";
import fs from "node:fs";

// Isolate test database to an ephemeral temporary directory
if (!process.env.MAPIGATE_DATA_DIR) {
  const testDataDir = path.join(
    os.tmpdir(),
    `mapigate-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );

  fs.mkdirSync(testDataDir, { recursive: true });
  process.env.MAPIGATE_DATA_DIR = testDataDir;

  const cleanup = () => {
    try {
      if (fs.existsSync(testDataDir)) {
        fs.rmSync(testDataDir, { recursive: true, force: true });
      }
    } catch {
      // Best-effort cleanup on exit
    }
  };

  process.once("exit", cleanup);
  process.once("SIGINT", cleanup);
  process.once("SIGTERM", cleanup);
}
