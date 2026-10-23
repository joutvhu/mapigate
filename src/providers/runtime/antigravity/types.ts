import type { RawQuotaBucket } from "../../../core/usage/types.js";

export const ANTIGRAVITY_IDE_VERSION = "2.24.0";
export const ANTIGRAVITY_USER_AGENT = "antigravity/hub/2.24.0 darwin/arm64";
export const ANTIGRAVITY_LOAD_PROJECT_URL = "https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist";
export const ANTIGRAVITY_QUOTA_MODELS_URL = "https://daily-cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels";
export const ANTIGRAVITY_QUOTA_SUMMARY_URL = "https://daily-cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary";

export const IDE_TYPE = {
  UNSPECIFIED: 0,
  JETSKI: 10,
  ANTIGRAVITY: 9,
  PLUGINS: 7,
} as const;

export const PLATFORM = {
  UNSPECIFIED: 0,
  DARWIN_AMD64: 1,
  DARWIN_ARM64: 2,
  LINUX_AMD64: 3,
  LINUX_ARM64: 4,
  WINDOWS_AMD64: 5,
} as const;

export const PLUGIN_TYPE = {
  UNSPECIFIED: 0,
  CLOUD_CODE: 1,
  GEMINI: 2,
} as const;

export function getPlatformEnum(): number {
  const os = process.platform;
  const architecture = process.arch;
  if (os === "darwin") return architecture === "arm64" ? PLATFORM.DARWIN_ARM64 : PLATFORM.DARWIN_AMD64;
  if (os === "linux") return architecture === "arm64" ? PLATFORM.LINUX_ARM64 : PLATFORM.LINUX_AMD64;
  if (os === "win32") return PLATFORM.WINDOWS_AMD64;
  return PLATFORM.UNSPECIFIED;
}

export const CLIENT_METADATA = {
  ideType: IDE_TYPE.ANTIGRAVITY,
  platform: getPlatformEnum(),
  pluginType: PLUGIN_TYPE.GEMINI,
};

export const GROUP_CONFIGS = [
  {
    pattern: /gemini/i,
    weekly: { key: "gemini_weekly", displayName: "Gemini (Weekly)" },
    session: { key: "gemini_session", displayName: "Gemini (5h)" },
  },
  {
    pattern: /claude|gpt/i,
    weekly: { key: "claude_gpt_weekly", displayName: "Claude & GPT (Weekly)" },
    session: { key: "claude_gpt_session", displayName: "Claude & GPT (5h)" },
  },
];

export const IMPORTANT_MODELS = [
  "gemini-3.8-flash-high",
  "gemini-3.8-flash-medium",
  "gemini-3.8-flash-low",
  "gemini-3.7-flash-high",
  "gemini-3.7-flash-medium",
  "gemini-3.7-flash-low",
  "gemini-3.6-flash-high",
  "gemini-3.6-flash-medium",
  "gemini-3.6-flash-low",
  "gemini-3.1-pro-high",
  "gemini-pro-agent",
  "gemini-3.1-pro-low",
  "claude-sonnet-5-5-high",
  "claude-sonnet-5-5-medium",
  "claude-sonnet-5-5-low",
  "claude-sonnet-5-5",
  "claude-opus-5-5-high",
  "claude-opus-5-5-medium",
  "claude-opus-5-5-low",
  "claude-opus-5-5",
  "claude-sonnet-4-6",
  "claude-opus-4-6-thinking",
  "gpt-oss-120b-medium",
  "gemini-3.1-flash-image",
];

export interface WeeklyCacheEntry {
  result?: Record<string, RawQuotaBucket>;
  expiresAt?: number;
  promise?: Promise<Record<string, RawQuotaBucket>>;
}
