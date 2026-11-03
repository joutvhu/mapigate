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

const cliToolsDir = path.resolve(projectRoot, "src", "cli", "tools", "definitions");
const mitmHandlersDir = path.resolve(projectRoot, "src", "mitm", "handlers");

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
        const match = url.match(/^\/assets\/(?:providers|tools|cli-tools)\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_.-]+)$/);
        if (!match || match[2].includes("..")) {
          return next();
        }

        const [, entity, file] = match;
        const categories = ["runtime", "catalog", "composite"];
        let targetFile: string | null = null;

        for (const cat of categories) {
          const catAssetPath = path.resolve(providersDir, cat, entity, "assets", file);
          if (fs.existsSync(catAssetPath) && fs.statSync(catAssetPath).isFile()) {
            targetFile = catAssetPath;
            break;
          }
        }

        if (!targetFile) {
          const flatAssetPath = path.resolve(providersDir, entity, "assets", file);
          const toolAssetPath = path.resolve(cliToolsDir, entity, "assets", file);
          const mitmAssetPath = path.resolve(mitmHandlersDir, entity, "assets", file);

          if (fs.existsSync(flatAssetPath) && fs.statSync(flatAssetPath).isFile()) {
            targetFile = flatAssetPath;
          } else if (fs.existsSync(toolAssetPath) && fs.statSync(toolAssetPath).isFile()) {
            targetFile = toolAssetPath;
          } else if (fs.existsSync(mitmAssetPath) && fs.statSync(mitmAssetPath).isFile()) {
            targetFile = mitmAssetPath;
          }
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
      // Copy provider and tool assets into dist/web/assets/ during build
      const targetDistProviders = path.resolve(projectRoot, "dist", "web", "assets", "providers");
      const targetDistTools = path.resolve(projectRoot, "dist", "web", "assets", "tools");

      try {
        const copyFromAssets = (sourceParentDir: string, destBase: string) => {
          if (!fs.existsSync(sourceParentDir)) return;
          const entries = fs.readdirSync(sourceParentDir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isDirectory()) {
              const assetsPath = path.resolve(sourceParentDir, entry.name, "assets");
              if (fs.existsSync(assetsPath)) {
                const files = fs.readdirSync(assetsPath, { withFileTypes: true });
                for (const f of files) {
                  if (f.isFile()) {
                    const destDir = path.resolve(destBase, entry.name);
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
        };

        if (fs.existsSync(providersDir)) {
          const categories = ["runtime", "catalog", "composite"];
          for (const cat of categories) {
            copyFromAssets(path.resolve(providersDir, cat), targetDistProviders);
          }
          copyFromAssets(providersDir, targetDistProviders);
        }

        copyFromAssets(cliToolsDir, targetDistTools);
        copyFromAssets(cliToolsDir, targetDistProviders);
        copyFromAssets(mitmHandlersDir, targetDistTools);
        copyFromAssets(mitmHandlersDir, targetDistProviders);
      } catch (err) {
        console.warn("[vite-plugin-provider-assets] Could not copy provider/tool assets:", err);
      }
    },
  };
}

const backendPort = process.env.PORT || 20127;
const backendTarget = `http://127.0.0.1:${backendPort}`;

export default defineConfig({
  plugins: [react(), tailwindcss(), providerAssetsPlugin()],
  define: {
    "process.env": {},
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("recharts") || id.includes("d3-")) {
              return "recharts";
            }
            if (id.includes("@dnd-kit")) {
              return "dnd-kit";
            }
            if (id.includes("lucide-react")) {
              return "lucide";
            }
            if (id.includes("react") || id.includes("scheduler") || id.includes("zustand")) {
              return "vendor";
            }
          }
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/v1": {
        target: backendTarget,
        changeOrigin: true,
      },
      "/api": {
        target: backendTarget,
        changeOrigin: true,
      },
      "/health": {
        target: backendTarget,
        changeOrigin: true,
      },
    },
  },
});
