import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../..");
const providersDir = path.resolve(projectRoot, "src", "providers");

const MIME_MAP: Record<string, string> = {
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
};

function providerAssetsPlugin(): Plugin {
  return {
    name: "vite-plugin-provider-assets",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split("?")[0] || "";
        const match = url.match(/^\/assets\/providers\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_.-]+)$/);
        if (!match || match[2].includes("..")) {
          return next();
        }

        const [, provider, file] = match;
        const assetPath = path.resolve(providersDir, provider, "assets", file);
        const fallbackPath = path.resolve(projectRoot, "src", "web", "public", "providers", file);

        let targetFile: string | null = null;
        if (fs.existsSync(assetPath) && fs.statSync(assetPath).isFile()) {
          targetFile = assetPath;
        } else if (fs.existsSync(fallbackPath) && fs.statSync(fallbackPath).isFile()) {
          targetFile = fallbackPath;
        }

        if (targetFile) {
          const ext = path.extname(targetFile).toLowerCase();
          const contentType = MIME_MAP[ext] || "application/octet-stream";
          res.setHeader("Content-Type", contentType);
          res.setHeader("Cache-Control", "no-cache");
          fs.createReadStream(targetFile).pipe(res);
          return;
        }

        next();
      });
    },
    closeBundle() {
      // Copy provider assets into dist/web/assets/providers during build
      const targetDistBase = path.resolve(projectRoot, "dist", "web", "assets", "providers");
      if (!fs.existsSync(providersDir)) return;

      try {
        const entries = fs.readdirSync(providersDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const assetsPath = path.resolve(providersDir, entry.name, "assets");
            if (fs.existsSync(assetsPath)) {
              const files = fs.readdirSync(assetsPath, { withFileTypes: true });
              for (const f of files) {
                if (f.isFile()) {
                  const destDir = path.resolve(targetDistBase, entry.name);
                  fs.mkdirSync(destDir, { recursive: true });
                  fs.copyFileSync(
                    path.resolve(assetsPath, f.name),
                    path.resolve(destDir, f.name)
                  );
                }
              }
            }
          }
        }
      } catch (err) {
        console.warn("[vite-plugin-provider-assets] Could not copy provider assets:", err);
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), providerAssetsPlugin()],
  server: {
    port: 5173,
    proxy: {
      "/v1": {
        target: "http://127.0.0.1:20127",
        changeOrigin: true,
      },
      "/api": {
        target: "http://127.0.0.1:20127",
        changeOrigin: true,
      },
      "/health": {
        target: "http://127.0.0.1:20127",
        changeOrigin: true,
      },
    },
  },
});
