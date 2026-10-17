export * from "../../cli/tools/types.js";
export { CLI_TOOLS, CLI_TOOLS_ARRAY } from "../../cli/tools/generated/toolsRegistry.js";

const DEFAULT_PORT = 20127;
const DEFAULT_HOST = "127.0.0.1";

function getEnv(key: string): string | undefined {
  if (typeof process !== "undefined" && process?.env) {
    return process.env[key];
  }
  return undefined;
}

export function getMapigateBaseUrl(port?: number, host?: string): string {
  const envPort = getEnv("PORT");
  const envHost = getEnv("HOST");
  const p = port || (envPort ? Number(envPort) : DEFAULT_PORT);
  const h = host || envHost || DEFAULT_HOST;
  return `http://${h === "0.0.0.0" ? "localhost" : h}:${p}`;
}

export function getMapigateV1Url(port?: number, host?: string): string {
  return `${getMapigateBaseUrl(port, host)}/v1`;
}

export const MAPIGATE_BASE_URL = getMapigateBaseUrl();
export const MAPIGATE_V1_URL = getMapigateV1Url();
