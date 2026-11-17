import fs from "node:fs";
import path from "node:path";
import { build } from "esbuild";

const distDir = path.resolve("dist");
const webDir = path.join(distDir, "web");

function collectJsFiles(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (fullPath === webDir) continue;
      collectJsFiles(fullPath, files);
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      files.push(fullPath);
    }
  }
  return files;
}

const entryPoints = collectJsFiles(distDir);
if (entryPoints.length === 0) {
  console.log("[minify] No server JS files found in dist/");
  process.exit(0);
}

const beforeBytes = entryPoints.reduce((sum, f) => sum + fs.statSync(f).size, 0);
const start = performance.now();

await build({
  entryPoints,
  outdir: distDir,
  outbase: distDir,
  bundle: false,
  minify: true,
  keepNames: true,
  format: "esm",
  platform: "node",
  target: "node22",
  allowOverwrite: true,
  legalComments: "none",
});

const afterBytes = entryPoints.reduce((sum, f) => sum + fs.statSync(f).size, 0);
const elapsedMs = Math.round(performance.now() - start);
const savedPct = beforeBytes > 0 ? (((beforeBytes - afterBytes) / beforeBytes) * 100).toFixed(1) : "0.0";

console.log(
  `[minify] Minified ${entryPoints.length} files in ${elapsedMs}ms: ${(beforeBytes / 1024).toFixed(1)} KB -> ${(afterBytes / 1024).toFixed(1)} KB (-${savedPct}%)`
);
