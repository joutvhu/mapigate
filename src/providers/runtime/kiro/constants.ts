/**
 * Official Kiro IDE & KAS (Kiro Agent Service) client headers and constants.
 * Single Source of Truth (SSOT) for Kiro runtime provider.
 */

export const KIRO_IDE_VERSION = "1.5.44";
export const KIRO_KAS_VERSION = "0.66.123-hotfix.2";
export const KIRO_OS_PLATFORM = "win32";

/**
 * Standard Kiro User-Agent matching official Kiro IDE & KAS.
 * Format: aws-sdk-js/3.0.0 KiroIDE/{appVersion} KAS/{kasVersion} os/{platform} md/appVersion-{appVersion}
 */
export const KIRO_USER_AGENT = `aws-sdk-js/3.0.0 KiroIDE/${KIRO_IDE_VERSION} KAS/${KIRO_KAS_VERSION} os/${KIRO_OS_PLATFORM} md/appVersion-${KIRO_IDE_VERSION}`;

/**
 * Common default headers required by Kiro endpoints
 */
export const KIRO_DEFAULT_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
  "User-Agent": KIRO_USER_AGENT,
  "x-amz-user-agent": KIRO_USER_AGENT,
};

/**
 * Whitelist of workflow, agent, and session tracing headers safe to forward upstream
 */
export const FORWARDABLE_KIRO_HEADERS = new Set([
  "x-amzn-kiro-agent-mode",
  "x-amzn-kiro-agent-name",
  "x-amzn-kiro-execution-id",
  "x-amzn-kiro-session-id",
  "x-amzn-kiro-agent-presentation",
  "x-amzn-kiro-mode-identifier",
  "x-amzn-kiro-origin",
  "x-amzn-kiro-client-attribution",
  "x-amzn-kiro-conversation-id",
  "x-amzn-codewhisperer-conversation-id",
  "x-amzn-codewhisperer-optout",
]);

/**
 * Extracts and forwards workflow, agent, and session headers sent from client
 */
export function extractKiroForwardHeaders(incomingHeaders?: Record<string, any>): Record<string, string> {
  if (!incomingHeaders) return {};
  const forwarded: Record<string, string> = {};
  for (const [key, val] of Object.entries(incomingHeaders)) {
    const lowerKey = key.toLowerCase();
    if (FORWARDABLE_KIRO_HEADERS.has(lowerKey)) {
      if (typeof val === "string" && val.trim()) {
        forwarded[lowerKey] = val.trim();
      } else if (Array.isArray(val) && val[0]) {
        forwarded[lowerKey] = String(val[0]).trim();
      }
    }
  }
  return forwarded;
}
