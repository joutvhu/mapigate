import type { CliToolDefinition } from "../../types.js";

export const definition: CliToolDefinition = {
  id: "cursor",
  name: "Cursor",
  image: "/providers/cursor.png",
  color: "#000000",
  description: "Cursor AI Code Editor",
  configType: "guide",
  binary: "cursor",
  docsUrl: "https://cursor.com",
  guideSteps: [
    { step: 1, title: "Open Settings", desc: "In Cursor, go to Settings → Models" },
    { step: 2, title: "Enable OpenAI API", desc: "Toggle 'OpenAI API key' on" },
    { step: 3, title: "Override Base URL", desc: "Enter Mapigate OpenAI-compatible endpoint:", value: "http://127.0.0.1:20127/v1", copyable: true },
    { step: 4, title: "Set API Key", desc: "Enter any non-empty string, e.g. 'mapigate-local'", value: "mapigate-local", copyable: true },
    { step: 5, title: "Add Custom Model", desc: "Click 'Add Custom Model' and enter your preferred model ID" },
  ],
};
