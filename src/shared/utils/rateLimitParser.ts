/**
 * Rate limit and Retry-After header parser.
 * Supports standard Retry-After (seconds or HTTP-date), Anthropic reset headers,
 * and OpenAI reset duration / timestamp headers.
 * All parsed values are clamped to [0, 300_000] ms (max 5 minutes).
 */

const MAX_RATE_LIMIT_DELAY_MS = 300_000; // 5 minutes ceiling

/**
 * Parse a duration string like "6s", "500ms", "1m30s", "2m", "1h".
 * Returns duration in milliseconds, or null if unparseable.
 */
export function parseDurationString(val: string): number | null {
  const trimmed = val.trim();
  if (!trimmed) return null;

  let totalMs = 0;
  let matchedAny = false;

  const tokenRegex = /(\d+(?:\.\d+)?)\s*(ms|milliseconds?|h(?:ours?)?|min(?:ute)?s?|m|sec(?:ond)?s?|s)(?=[0-9\s]|$)/gi;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(trimmed)) !== null) {
    const num = Number.parseFloat(match[1]);
    const unit = match[2].toLowerCase();
    matchedAny = true;

    if (unit === "ms" || unit.startsWith("milli")) {
      totalMs += num;
    } else if (unit.startsWith("h")) {
      totalMs += num * 3_600_000;
    } else if (unit.startsWith("min") || unit === "m") {
      totalMs += num * 60_000;
    } else if (unit.startsWith("s") || unit.startsWith("sec")) {
      totalMs += num * 1_000;
    }
  }

  return matchedAny && totalMs > 0 ? totalMs : null;
}

/**
 * Parse a standard Retry-After header value (seconds or HTTP-date).
 * Clamped to [0, MAX_RATE_LIMIT_DELAY_MS].
 */
export function parseRetryAfter(val: string): number | null {
  const trimmed = val.trim();
  if (!trimmed) return null;

  // 1. Try numeric seconds (integer or float)
  const num = Number.parseFloat(trimmed);
  if (Number.isFinite(num) && !isNaN(num) && /^\d+(\.\d+)?$/.test(trimmed)) {
    const ms = Math.max(0, num * 1000);
    return Math.min(ms, MAX_RATE_LIMIT_DELAY_MS);
  }

  // 2. Try HTTP-date
  const parsedDate = Date.parse(trimmed);
  if (!isNaN(parsedDate)) {
    const deltaMs = parsedDate - Date.now();
    return Math.min(Math.max(0, deltaMs), MAX_RATE_LIMIT_DELAY_MS);
  }

  return null;
}

/**
 * Parse timestamp, date string, or duration from provider reset headers.
 */
export function parseResetValue(val: string): number | null {
  const trimmed = val.trim();
  if (!trimmed) return null;

  // Try duration string first ("6s", "20ms", "1m30s")
  const duration = parseDurationString(trimmed);
  if (duration !== null) {
    return Math.min(Math.max(0, duration), MAX_RATE_LIMIT_DELAY_MS);
  }

  // Try pure numeric (could be seconds or unix epoch in seconds or ms)
  const num = Number.parseFloat(trimmed);
  if (Number.isFinite(num) && !isNaN(num) && /^\d+(\.\d+)?$/.test(trimmed)) {
    // If it's a huge number (> 1e9), treat as epoch timestamp
    if (num > 1_000_000_000_000) {
      // epoch in ms
      const deltaMs = num - Date.now();
      return Math.min(Math.max(0, deltaMs), MAX_RATE_LIMIT_DELAY_MS);
    }
    if (num > 1_000_000_000) {
      // epoch in seconds
      const deltaMs = num * 1000 - Date.now();
      return Math.min(Math.max(0, deltaMs), MAX_RATE_LIMIT_DELAY_MS);
    }
    // Otherwise relative seconds
    return Math.min(Math.max(0, num * 1000), MAX_RATE_LIMIT_DELAY_MS);
  }

  // Try ISO date
  const parsedDate = Date.parse(trimmed);
  if (!isNaN(parsedDate)) {
    const deltaMs = parsedDate - Date.now();
    return Math.min(Math.max(0, deltaMs), MAX_RATE_LIMIT_DELAY_MS);
  }

  return null;
}

function getHeader(
  headers: Headers | Record<string, string | string[] | undefined> | undefined | null,
  name: string
): string | null {
  if (!headers) return null;
  if (typeof (headers as Headers).get === "function") {
    return (headers as Headers).get(name) || (headers as Headers).get(name.toLowerCase());
  }
  const obj = headers as Record<string, string | string[] | undefined>;
  const lowerName = name.toLowerCase();
  for (const [k, v] of Object.entries(obj)) {
    if (k.toLowerCase() === lowerName) {
      if (Array.isArray(v)) return v[0] || null;
      return typeof v === "string" ? v : null;
    }
  }
  return null;
}

/**
 * Inspect upstream HTTP headers for rate limit reset indicators.
 * Looks for Retry-After, Anthropic reset headers, and OpenAI x-ratelimit-reset headers.
 * Returns delay in milliseconds clamped to [0, 300_000], or null if none found.
 */
export function parseRateLimitHeaders(
  headers: Headers | Record<string, string | string[] | undefined> | undefined | null
): number | null {
  if (!headers) return null;

  // 1. Standard Retry-After
  const retryAfter = getHeader(headers, "retry-after");
  if (retryAfter) {
    const parsed = parseRetryAfter(retryAfter);
    if (parsed !== null) return parsed;
  }

  // 2. OpenAI rate limit headers
  const oaiResetRequests = getHeader(headers, "x-ratelimit-reset-requests");
  if (oaiResetRequests) {
    const parsed = parseResetValue(oaiResetRequests);
    if (parsed !== null) return parsed;
  }

  const oaiResetTokens = getHeader(headers, "x-ratelimit-reset-tokens");
  if (oaiResetTokens) {
    const parsed = parseResetValue(oaiResetTokens);
    if (parsed !== null) return parsed;
  }

  // 3. Anthropic rate limit headers
  const anthropicResetReq = getHeader(headers, "anthropic-ratelimit-requests-reset");
  if (anthropicResetReq) {
    const parsed = parseResetValue(anthropicResetReq);
    if (parsed !== null) return parsed;
  }

  const anthropicResetTokens = getHeader(headers, "anthropic-ratelimit-tokens-reset");
  if (anthropicResetTokens) {
    const parsed = parseResetValue(anthropicResetTokens);
    if (parsed !== null) return parsed;
  }

  return null;
}
