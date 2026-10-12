import type { CliToolDefinition } from "../../types.js";

export const definition: CliToolDefinition = {
  id: "droid",
  name: "Factory Droid",
  image: "/providers/droid.png",
  color: "#00D4FF",
  iconBg: "#FFFFFF",
  description: "Factory Droid AI Assistant",
  configType: "custom",
  binary: "droid",
  configPath: "~/.factory/config.json",
  baseUrlPath: "/v1",
  powershellTemplate: `$env:FACTORY_BASE_URL = "http://127.0.0.1:20127/v1"\n$env:FACTORY_API_KEY = "mapigate-local"\ndroid`,
  bashTemplate: `export FACTORY_BASE_URL="http://127.0.0.1:20127/v1"\nexport FACTORY_API_KEY="mapigate-local"\ndroid`,
  configFileTemplate: `{\n  "baseUrl": "http://127.0.0.1:20127/v1",\n  "apiKey": "mapigate-local"\n}`,
};
