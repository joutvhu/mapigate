/**
 * Cache Control Policy
 *
 * Centralizes prompt cache_control policy:
 * - Preserves explicit cache_control breakpoints for providers that natively support them
 *   (Anthropic / Claude native format, DashScope / Alibaba, and Xiaomi MiMo).
 * - Recursively strips cache_control properties for providers that do not accept them
 *   or use implicit/automatic prefix caching (standard OpenAI, Azure, Codex, Ollama).
 */

/**
 * Determines whether cache_control breakpoints should be preserved for a given provider,
 * model, and target wire format.
 */
export function shouldPreserveCacheControl(
  providerId: string,
  _model: string,
  targetFormat: string
): boolean {
  const pId = (providerId || "").toLowerCase();
  const format = (targetFormat || "").toLowerCase();

  // 1. Anthropic / Claude native format or Anthropic provider
  if (format === "claude" || pId.includes("anthropic") || pId.includes("claude")) {
    return true;
  }

  // 2. DashScope / Alibaba / Qwen (OpenAI-compatible endpoints natively accept cache_control)
  if (pId.includes("dashscope") || pId.includes("alibaba") || pId.includes("qwen")) {
    return true;
  }

  // 3. Xiaomi MiMo (OpenAI-compatible endpoints natively accept cache_control)
  if (pId.includes("mimo") || pId.includes("xiaomi")) {
    return true;
  }

  return false;
}

/**
 * Recursively deletes all `cache_control` properties from an object or array in-place.
 * Uses a WeakSet guard against circular references.
 */
export function stripCacheControl(obj: any, visited = new WeakSet()): void {
  if (!obj || typeof obj !== "object") return;
  if (visited.has(obj)) return;
  visited.add(obj);

  if (Array.isArray(obj)) {
    for (const item of obj) {
      if (item && typeof item === "object") {
        stripCacheControl(item, visited);
      }
    }
    return;
  }

  if ("cache_control" in obj) {
    delete obj.cache_control;
  }

  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (val && typeof val === "object") {
      stripCacheControl(val, visited);
    }
  }
}

/**
 * Applies cache control policy to upstream request body.
 * Modifies the body in place. Fails open on unexpected errors.
 */
export function applyCacheControlPolicy(
  body: any,
  providerId: string,
  model: string,
  targetFormat: string
): void {
  if (!body || typeof body !== "object") return;

  try {
    if (shouldPreserveCacheControl(providerId, model, targetFormat)) {
      return;
    }
    stripCacheControl(body);
  } catch {
    // Fail-open: never break request execution
  }
}
