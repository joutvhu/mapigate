/**
 * MITM Tool Hosts & Routing Constants
 * Ported and aligned with 9router's verified hosts, patterns, and helpers.
 */

export type MitmToolId = "antigravity" | "kiro" | "copilot" | "cursor";

export const TOOL_HOSTS: Record<MitmToolId, string[]> = {
  antigravity: [
    "daily-cloudcode-pa.googleapis.com",
    "cloudcode-pa.googleapis.com",
  ],
  copilot: [
    "api.individual.githubcopilot.com",
  ],
  kiro: [
    "runtime.us-east-1.kiro.dev",
    "q.us-east-1.amazonaws.com",
    "codewhisperer.us-east-1.amazonaws.com",
  ],
  cursor: [
    "api2.cursor.sh",
  ],
};

export const ALL_MITM_HOSTS: string[] = Array.from(
  new Set(Object.values(TOOL_HOSTS).flat())
);

export const TARGET_HOSTS: string[] = [...ALL_MITM_HOSTS];

/**
 * Host rewrite for upstream forwarding:
 * Production cloudcode-pa is often rate-limited (429), while daily-cloudcode-pa
 * (dev endpoint) accepts the same body + token without restrictive limits.
 */
export const HOST_REWRITE: Record<string, string> = {
  "cloudcode-pa.googleapis.com": "daily-cloudcode-pa.googleapis.com",
};

export const URL_PATTERNS: Record<MitmToolId, string[]> = {
  antigravity: [":generateContent", ":streamGenerateContent"],
  copilot: ["/chat/completions", "/v1/messages", "/responses"],
  kiro: ["/generateAssistantResponse", "/responses"],
  cursor: ["/BidiAppend", "/RunSSE", "/RunPoll", "/Run"],
};

export const MODEL_SYNONYMS: Record<string, Record<string, string>> = {
  antigravity: {
    "gemini-default": "gemini-3.8-flash-medium",
    "gemini-3.5-flash-high": "gemini-3.8-flash-high",
    "gemini-3.5-flash-medium": "gemini-3.8-flash-medium",
    "gemini-3.5-flash-low": "gemini-3.8-flash-low",
    "gemini-3.5-flash-extra-low": "gemini-3.8-flash-low",
    "gemini-3.8-flash": "gemini-3.8-flash-medium",
    "gemini-3.8-flash-high": "gemini-3.8-flash-high",
    "gemini-3.8-flash-medium": "gemini-3.8-flash-medium",
    "gemini-3.8-flash-low": "gemini-3.8-flash-low",
    "gemini-3.7-flash-high": "gemini-3.7-flash-high",
    "gemini-3.7-flash-medium": "gemini-3.7-flash-medium",
    "gemini-3.7-flash-low": "gemini-3.7-flash-low",
    "gemini-3.6-flash-high": "gemini-3.6-flash-high",
    "gemini-3.6-flash-medium": "gemini-3.6-flash-medium",
    "gemini-3.6-flash-low": "gemini-3.6-flash-low",
    "gemini-3.1-pro-high": "gemini-pro-agent",
    "gemini-3-pro-high": "gemini-pro-agent",
    "gemini-3-pro-low": "gemini-3.1-pro-low",
    "claude-sonnet-5-5-high": "claude-sonnet-5-5-high",
    "claude-sonnet-5-5-medium": "claude-sonnet-5-5-medium",
    "claude-sonnet-5-5-low": "claude-sonnet-5-5-low",
    "claude-sonnet-5-5": "claude-sonnet-5-5",
    "claude-sonnet-5.5": "claude-sonnet-5-5",
    "claude-sonnet-5.5-high": "claude-sonnet-5-5-high",
    "claude-sonnet-5.5-medium": "claude-sonnet-5-5-medium",
    "claude-sonnet-5.5-low": "claude-sonnet-5-5-low",
    "claude-sonnet-5-5-thinking": "claude-sonnet-5-5",
    "claude-sonnet-5.5-thinking": "claude-sonnet-5-5",
    "claude-opus-5-5-high": "claude-opus-5-5-high",
    "claude-opus-5-5-medium": "claude-opus-5-5-medium",
    "claude-opus-5-5-low": "claude-opus-5-5-low",
    "claude-opus-5-5": "claude-opus-5-5",
    "claude-opus-5.5": "claude-opus-5-5",
    "claude-opus-5.5-high": "claude-opus-5-5-high",
    "claude-opus-5.5-medium": "claude-opus-5-5-medium",
    "claude-opus-5.5-low": "claude-opus-5-5-low",
    "claude-opus-5-5-thinking": "claude-opus-5-5",
    "claude-opus-5.5-thinking": "claude-opus-5-5",
    "claude-sonnet-4.6": "claude-sonnet-4-6",
    "claude-opus-4.6": "claude-opus-4-6-thinking",
    "claude-opus-4.6-thinking": "claude-opus-4-6-thinking",
  },
};

export const MODEL_PATTERNS: Record<string, Array<{ match: RegExp; alias: string }>> = {
  antigravity: [
    { match: /flash.*extra.*low|extra.*low.*flash|flash.*low|low.*flash/i, alias: "gemini-3.8-flash-low" },
    { match: /flash.*medium|medium.*flash/i, alias: "gemini-3.8-flash-medium" },
    { match: /flash.*agent|agent.*flash|flash/i, alias: "gemini-3.8-flash-high" },
    { match: /pro.*low|low.*pro/i, alias: "gemini-3.1-pro-low" },
    { match: /gemini.*pro|pro.*gemini/i, alias: "gemini-pro-agent" },
    { match: /opus.*5[.-]5.*high|5[.-]5.*opus.*high/i, alias: "claude-opus-5-5-high" },
    { match: /opus.*5[.-]5.*medium|5[.-]5.*opus.*medium/i, alias: "claude-opus-5-5-medium" },
    { match: /opus.*5[.-]5.*low|5[.-]5.*opus.*low/i, alias: "claude-opus-5-5-low" },
    { match: /sonnet.*5[.-]5.*high|5[.-]5.*sonnet.*high/i, alias: "claude-sonnet-5-5-high" },
    { match: /sonnet.*5[.-]5.*medium|5[.-]5.*sonnet.*medium/i, alias: "claude-sonnet-5-5-medium" },
    { match: /sonnet.*5[.-]5.*low|5[.-]5.*sonnet.*low/i, alias: "claude-sonnet-5-5-low" },
    { match: /opus.*5[.-]5|5[.-]5.*opus/i, alias: "claude-opus-5-5" },
    { match: /sonnet.*5[.-]5|5[.-]5.*sonnet/i, alias: "claude-sonnet-5-5" },
    { match: /opus/i, alias: "claude-opus-4-6-thinking" },
    { match: /sonnet|claude/i, alias: "claude-sonnet-4-6" },
    { match: /gpt.*oss|oss/i, alias: "gpt-oss-120b-medium" },
  ],
};

/**
 * Models that must NEVER be re-routed — always passed through to real upstream.
 * For instance, Antigravity's inline autocomplete (^tab[_-]) needs near-zero latency.
 */
export const MODEL_NO_MAP: Record<string, RegExp[]> = {
  antigravity: [/^tab[_-]/i],
};

export const MITM_TOOLS_METADATA = [
  {
    id: "antigravity" as MitmToolId,
    name: "Antigravity IDE",
    image: "/providers/antigravity.png",
    desc: "Google Antigravity IDE with MITM proxy",
  },
  {
    id: "kiro" as MitmToolId,
    name: "Kiro IDE",
    image: "/providers/kiro.png",
    desc: "Amazon Kiro IDE with MITM proxy",
  },
  {
    id: "copilot" as MitmToolId,
    name: "GitHub Copilot",
    image: "/providers/copilot.png",
    desc: "GitHub Copilot in VS Code via MITM proxy",
  },
  {
    id: "cursor" as MitmToolId,
    name: "Cursor",
    image: "/providers/cursor.png",
    desc: "Cursor IDE with MITM proxy (Coming Soon)",
  },
];

/**
 * Resolve tool ID from request host header.
 */
export function getToolForHost(host?: string | null): MitmToolId | null {
  if (!host) return null;
  const h = host.split(":")[0].trim().toLowerCase();

  for (const [tool, hosts] of Object.entries(TOOL_HOSTS) as [MitmToolId, string[]][]) {
    if (hosts.some((target) => target.toLowerCase() === h)) {
      return tool;
    }
  }

  // Fallback heuristic
  if (h.includes("cloudcode-pa.googleapis.com")) return "antigravity";
  if (h.includes("githubcopilot.com")) return "copilot";
  if (h.includes("kiro.dev") || h.includes("q.us-east-1.amazonaws.com") || h.includes("codewhisperer.us-east-1.amazonaws.com")) return "kiro";
  if (h.includes("cursor.sh")) return "cursor";

  return null;
}

/**
 * Check if a host belongs to any MITM-intercepted tool.
 */
export function isMitmHost(host?: string | null): boolean {
  return getToolForHost(host) !== null;
}

/**
 * Format default hosts file entries for a given tool.
 */
export function formatToolDefaultHosts(tool: MitmToolId, ip = "127.0.0.1"): string {
  const hosts = TOOL_HOSTS[tool] || [];
  return hosts.map((h) => `${ip} ${h}`).join("\n");
}

/**
 * Determine whether a request is a chat turn to intercept vs passthrough.
 */
export function isChatRequest(
  tool: MitmToolId,
  req: { url?: string; headers?: Record<string, string | string[] | undefined> }
): boolean {
  const url = req.url || "";
  const patterns = URL_PATTERNS[tool] || [];

  if (patterns.some((p) => url.includes(p))) {
    return true;
  }

  if (tool === "kiro") {
    const rawTarget = req.headers?.["x-amz-target"];
    const target = Array.isArray(rawTarget) ? rawTarget[0] : String(rawTarget || "");
    if (target.includes("GenerateAssistantResponse") || target.includes("CreateResponse")) {
      return true;
    }
  }

  return false;
}

function isBinaryData(buffer: Buffer): boolean {
  if (!buffer || buffer.length === 0) return false;
  const sample = buffer.subarray(0, Math.min(100, buffer.length));
  let nonPrintable = 0;
  for (let i = 0; i < sample.length; i++) {
    const byte = sample[i];
    if (byte < 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d) {
      nonPrintable++;
    }
    if (byte > 0x7e) nonPrintable++;
  }
  return nonPrintable / sample.length > 0.3;
}

/**
 * Extract model ID from URL path (Gemini), body (OpenAI/Anthropic), or Kiro conversationState.
 */
export function extractModel(url: string = "", body: Buffer | string | any = ""): string | null {
  const urlMatch = url.match(/\/models\/([^/:]+)/);
  const urlModel = urlMatch?.[1] || null;

  if (Buffer.isBuffer(body) && isBinaryData(body)) {
    return urlModel;
  }

  try {
    let parsed: any;
    if (typeof body === "string") {
      parsed = JSON.parse(body);
    } else if (Buffer.isBuffer(body)) {
      parsed = JSON.parse(body.toString("utf8"));
    } else if (typeof body === "object" && body !== null) {
      parsed = body;
    }

    if (parsed) {
      if (parsed.conversationState) {
        return (
          parsed.conversationState.currentMessage?.userInputMessage?.modelId ||
          parsed.conversationState.currentMessage?.userInputMessage?.model ||
          null
        );
      }
      const model = urlModel || parsed.model || null;
      if (!model) return urlModel;

      const cleanModelName = String(model).replace(/^models\//, "");
      if (
        cleanModelName === "gemini-3.6-flash-tiered" ||
        cleanModelName === "gemini-3.7-flash-tiered" ||
        cleanModelName === "gemini-3.8-flash-tiered"
      ) {
        const ver = cleanModelName.includes("3.8") ? "3.8" : cleanModelName.includes("3.7") ? "3.7" : "3.6";
        const rawLevel =
          parsed.request?.generationConfig?.thinkingConfig?.thinkingLevel ||
          parsed.generationConfig?.thinkingConfig?.thinkingLevel;
        const level = ["high", "medium", "low"].includes(String(rawLevel).toLowerCase())
          ? String(rawLevel).toLowerCase()
          : "medium";
        return `gemini-${ver}-flash-${level}`;
      }
      return model;
    }
  } catch {
    // Ignore JSON parse errors
  }

  return urlModel;
}
