import fs from "node:fs";
import path from "node:path";
import { home, v1, ensureBackup, rewriteFileSafe, pruneTomlSection } from "../helpers.js";
import type { ToolConfigHandler } from "../types.js";

export const codexPath = () => path.join(home(), ".codex", "config.toml");

export const codexHandler: ToolConfigHandler = {
  id: "codex",
  name: "OpenAI Codex CLI",
  paths: () => [codexPath()],
  async show() {
    const file = codexPath();
    if (!fs.existsSync(file)) return {};
    const text = fs.readFileSync(file, "utf8");
    const isMapigate = text.includes("mapigate") || text.includes("9router");
    const modelMatch = text.match(/^model\s*=\s*["']([^"']+)["']/m);
    const urlMatch = text.match(/base_url\s*=\s*["']([^"']+)["']/m);
    const authMatch = text.match(/Bearer\s+([^"'\s}]+)/m);
    return {
      baseUrl: urlMatch ? urlMatch[1] : undefined,
      apiKey: authMatch ? authMatch[1] : undefined,
      models: (modelMatch ? { main: modelMatch[1] } : {}) as Record<string, string>,
      active: isMapigate,
    };
  },
  async apply({ baseUrl, apiKey, model = "claude-sonnet-4-6" }) {
    const file = codexPath();
    ensureBackup(file);

    let baseText = "";
    if (fs.existsSync(file)) {
      try {
        baseText = fs.readFileSync(file, "utf8");
      } catch {
        baseText = "";
      }
    }

    let cleaned = pruneTomlSection(baseText, "model_providers.mapigate");
    cleaned = pruneTomlSection(cleaned, "model_providers.9router");
    cleaned = cleaned.replace(/^[ \t]*model_provider\s*=\s*["'][^"']*["'][ \t]*\r?\n?/gm, "");
    cleaned = cleaned.replace(/^[ \t]*model\s*=\s*["'][^"']*["'][ \t]*\r?\n?/gm, "");
    cleaned = cleaned.trim();

    const mapigateSection = [
      `[model_providers.mapigate]`,
      `name = "Mapigate"`,
      `base_url = "${v1(baseUrl)}"`,
      `wire_api = "responses"`,
      `http_headers = { Authorization = "Bearer ${apiKey}" }`,
    ].join("\n");

    const newContent = [
      `model_provider = "mapigate"`,
      `model = "${model}"`,
      cleaned ? `\n${cleaned}\n` : "",
      mapigateSection,
      "",
    ].filter(Boolean).join("\n");

    rewriteFileSafe(file, newContent);
    return [file];
  },
  async reset() {
    const file = codexPath();
    if (!fs.existsSync(file)) return [];
    const backup = `${file}.bak-mapigate`;
    let text = "";
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      return [];
    }

    text = pruneTomlSection(text, "model_providers.mapigate");
    text = pruneTomlSection(text, "model_providers.9router");
    text = text.replace(/^[ \t]*model_provider\s*=\s*["'](?:mapigate|9router)["'][ \t]*\r?\n?/gm, "");
    text = text.replace(/^[ \t]*default_subagent_model\s*=\s*["'][^"']*["'][ \t]*\r?\n?/gm, "");
    text = pruneTomlSection(text, "agents.subagent");

    text = text.replace(/(\r?\n){3,}/g, "\n\n").trim();

    if (text.length > 0) {
      rewriteFileSafe(file, text + "\n");
    } else if (fs.existsSync(backup)) {
      try {
        fs.copyFileSync(backup, file);
      } catch {
        rewriteFileSafe(file, "");
      }
    } else {
      rewriteFileSafe(file, "");
    }
    return [file];
  },
};
