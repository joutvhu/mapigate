import type { CliToolDefinition } from "../../types.js";
import { DEFAULT_V1_URL } from "../../helpers.js";

export const definition: CliToolDefinition = {
  id: "cursor",
  name: "Cursor",
  image: "/assets/providers/cursor/icon.png",
  color: "#000000",
  iconBg: "#FFFFFF",
  description: "Cursor AI Code Editor",
  configType: "guide",
  binary: "cursor",
  docsUrl: "https://cursor.com",
  defaultModels: [
    "claude-3-7-sonnet",
    "claude-3-7-sonnet-thinking",
    "claude-3-5-sonnet",
    "claude-sonnet-4-6",
    "gpt-4o",
    "gpt-4o-mini",
    "cursor-small",
    "deepseek-v3",
    "deepseek-r1",
  ],
  guideSteps: [
    { step: 1, title: "Open Settings", desc: "In Cursor, go to Settings → Models" },
    { step: 2, title: "Enable OpenAI API", desc: "Toggle 'OpenAI API key' on" },
    { step: 3, title: "Override Base URL", desc: "Enter Mapigate OpenAI-compatible endpoint:", value: DEFAULT_V1_URL, copyable: true },
    { step: 4, title: "Set API Key", desc: "Enter any non-empty string, e.g. 'mapigate-local'", value: "mapigate-local", copyable: true },
    { step: 5, title: "Add Custom Model", desc: "Click 'Add Custom Model' and enter your preferred model ID" },
  ],
};
