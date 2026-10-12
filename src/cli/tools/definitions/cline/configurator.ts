import path from "node:path";
import { home, readJsonSafe, writeJsonSafe, rewriteFileSafe } from "../../helpers.js";
import type { ToolConfigHandler } from "../../types.js";

export const clineState = () => path.join(home(), ".cline", "data", "globalState.json");
export const clineSecrets = () => path.join(home(), ".cline", "data", "secrets.json");

export const clineHandler: ToolConfigHandler = {
  id: "cline",
  name: "Cline CLI",
  paths: () => [clineState(), clineSecrets()],
  async show() {
    const state = readJsonSafe(clineState()) || {};
    const secrets = readJsonSafe(clineSecrets()) || {};
    return {
      baseUrl: state.openAiBaseUrl,
      apiKey: secrets.openAiApiKey,
      models: (state.openAiModelId ? { main: state.openAiModelId } : {}) as Record<string, string>,
      active: state.actModeApiProvider === "openai",
    };
  },
  async apply({ baseUrl, apiKey, model = "claude-sonnet-4-6" }) {
    const state = readJsonSafe(clineState()) || {};
    state.actModeApiProvider = "openai";
    state.planModeApiProvider = "openai";
    state.openAiBaseUrl = baseUrl;
    state.openAiModelId = model;
    state.planModeOpenAiModelId = model;
    writeJsonSafe(clineState(), state);

    const secrets = readJsonSafe(clineSecrets()) || {};
    secrets.openAiApiKey = apiKey;
    writeJsonSafe(clineSecrets(), secrets);
    return [clineState(), clineSecrets()];
  },
  async reset() {
    const state = readJsonSafe(clineState());
    if (state && state.actModeApiProvider === "openai") {
      delete state.openAiBaseUrl;
      delete state.openAiModelId;
      delete state.planModeOpenAiModelId;
      state.actModeApiProvider = "cline";
      rewriteFileSafe(clineState(), JSON.stringify(state, null, 2));
    }
    const secrets = readJsonSafe(clineSecrets());
    if (secrets && secrets.openAiApiKey) {
      delete secrets.openAiApiKey;
      rewriteFileSafe(clineSecrets(), JSON.stringify(secrets, null, 2));
    }
    return [clineState(), clineSecrets()];
  },
};

export default clineHandler;
