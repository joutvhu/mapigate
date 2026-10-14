/**
 * Error Sanitizer
 * Mitigates CWE-209 (Information Exposure Through an Error Message).
 * Redacts developer filesystem paths, stack trace frames, and credentials
 * from error messages before sending to downstream clients or logging.
 */

const WINDOWS_PATH_REGEX = /\b[a-zA-Z]:[\\/][^\s"'`<>)]+/g;
const POSIX_ROOTS_REGEX = /(?<!https?:)(?<![a-zA-Z0-9_])\/(?:Users|home|root|app|workspace|var|tmp|etc|usr|opt|srv|mnt|dev|private|path)\/[^\s"'`<>)]+/gi;
const POSIX_FILES_REGEX = /(?<!https?:)(?<![a-zA-Z0-9_])\/(?:[a-zA-Z0-9_.-]+\/)+[a-zA-Z0-9_.-]+\.(?:ts|js|jsx|tsx|json|mjs|cjs|py|rb|go|rs|env|log|txt|md|yaml|yml|sh|bat|cmd)(?::\d+(?::\d+)?)?/gi;
const FILE_URI_REGEX = /file:\/\/\/[^\s"'`<>)]+/gi;
const BEARER_REGEX = /\bBearer\s+[a-zA-Z0-9._~+/=-]+/gi;
const JWT_REGEX = /\beyJ[a-zA-Z0-9_-]{5,}\.[a-zA-Z0-9_-]{5,}\.[a-zA-Z0-9_-]+/g;
const OPENAI_KEY_REGEX = /\bsk-[a-zA-Z0-9_-]{8,}/g;

function stripTrailingPunctuation(match: string): { path: string; trailing: string } {
  let trailing = "";
  let path = match;
  while (path.length > 0 && /[.,;!?]/.test(path[path.length - 1])) {
    trailing = path[path.length - 1] + trailing;
    path = path.slice(0, -1);
  }
  return { path, trailing };
}

/**
 * Sanitize an error message string:
 * 1. Truncates stack traces after the first `\n    at `
 * 2. Redacts Bearer tokens and JWTs
 * 3. Masks OpenAI API keys (`sk-***`)
 * 4. Redacts Windows drive paths (both backslash and forward-slash) with `[path redacted]`
 * 5. Redacts POSIX absolute paths with `[path redacted]`
 */
export function sanitizeErrorMessage(message: unknown): string {
  if (message === null || message === undefined) return "";
  let clean = typeof message === "string" ? message : String(message);

  // 1. Truncate stack traces at \n    at (or \r\n    at)
  const stackIdx = clean.search(/\r?\n\s+at\s+/);
  if (stackIdx !== -1) {
    clean = clean.slice(0, stackIdx);
  }

  // 2. Redact Bearer tokens
  clean = clean.replace(BEARER_REGEX, "Bearer [redacted]");

  // 3. Redact JWTs
  clean = clean.replace(JWT_REGEX, "[jwt redacted]");

  // 4. Mask OpenAI API keys
  clean = clean.replace(OPENAI_KEY_REGEX, "sk-***");

  // 5. Redact file:// URIs
  clean = clean.replace(FILE_URI_REGEX, "[path redacted]");

  // 6. Redact Windows drive paths (both \ and /)
  clean = clean.replace(WINDOWS_PATH_REGEX, (match) => {
    const { trailing } = stripTrailingPunctuation(match);
    return `[path redacted]${trailing}`;
  });

  // 7. Redact POSIX absolute paths rooted at common system directories
  clean = clean.replace(POSIX_ROOTS_REGEX, (match) => {
    const { trailing } = stripTrailingPunctuation(match);
    return `[path redacted]${trailing}`;
  });

  // 8. Redact POSIX file paths with extensions
  clean = clean.replace(POSIX_FILES_REGEX, (match) => {
    const { trailing } = stripTrailingPunctuation(match);
    return `[path redacted]${trailing}`;
  });

  return clean;
}

/**
 * Deeply sanitize an error object, Error instance, or array.
 * Recursively redacts credentials and filesystem paths from string values.
 */
export function sanitizeErrorResponse<T = any>(err: T): T {
  if (err === null || err === undefined) return err;
  if (typeof err === "string") return sanitizeErrorMessage(err) as unknown as T;
  if (typeof err === "number" || typeof err === "boolean") return err;

  if (err instanceof Error) {
    const sanitized: Record<string, any> = {
      name: err.name,
      message: sanitizeErrorMessage(err.message),
    };
    if (typeof (err as any).stack === "string") {
      sanitized.stack = sanitizeErrorMessage((err as any).stack);
    }
    for (const key of Object.keys(err)) {
      if (key === "name" || key === "message" || key === "stack") continue;
      sanitized[key] = sanitizeErrorResponse((err as any)[key]);
    }
    return sanitized as unknown as T;
  }

  if (Array.isArray(err)) {
    return err.map((item) => sanitizeErrorResponse(item)) as unknown as T;
  }

  if (typeof err === "object") {
    const result: Record<string, any> = {};
    for (const [key, val] of Object.entries(err)) {
      if (key.toLowerCase() === "stack" && typeof val === "string") {
        result[key] = sanitizeErrorMessage(val);
      } else {
        result[key] = sanitizeErrorResponse(val);
      }
    }
    return result as unknown as T;
  }

  return err;
}
