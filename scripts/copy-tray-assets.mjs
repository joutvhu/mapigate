import fs from "node:fs";
import path from "node:path";

const srcDir = path.resolve("src", "cli", "tray");
const destDir = path.resolve("dist", "cli", "tray");
const files = ["tray.ps1", "icon.ico", "icon.png"];

fs.mkdirSync(destDir, { recursive: true });
for (const file of files) {
  fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file));
}
