import { createHash, randomUUID } from "node:crypto";
import { metadata } from "./metadata.js";

const CHAR_REPLACEMENTS = new Map<string, string>([
  ["&", " and "],
  ["🦄", " unicorn "],
  ["♥", " love "],
  ["ß", "ss"],
  ["ẞ", "Ss"],
  ["ä", "ae"],
  ["Ä", "Ae"],
  ["ö", "oe"],
  ["Ö", "Oe"],
  ["ü", "ue"],
  ["Ü", "Ue"],
  ["Æ", "AE"],
  ["æ", "ae"],
  ["Ø", "O"],
  ["ø", "o"],
  ["Œ", "OE"],
  ["œ", "oe"],
  ["Ð", "D"],
  ["ð", "d"],
  ["Đ", "D"],
  ["đ", "d"],
  ["Þ", "TH"],
  ["þ", "th"],
  ["Ł", "L"],
  ["ł", "l"],
  ["ı", "i"],
]);

function transliterate(value: string): string {
  let out = "";
  for (const ch of value) out += CHAR_REPLACEMENTS.get(ch) ?? ch;
  return out.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function decamelize(value: string): string {
  return value
    .replace(/([A-Z]{2,})(\d+)/g, "$1 $2")
    .replace(/([a-z\d]+)([A-Z]{2,})/g, "$1 $2")
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-rt-z\d]+)/g, "$1 $2");
}

export function slugifyPath(value: string): string {
  return decamelize(transliterate(String(value ?? "")))
    .toLowerCase()
    .replace(/[^a-z\d]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function toCommandCodeSessionUuid(sessionId?: string | null): string {
  if (!sessionId) return randomUUID();
  const h = createHash("sha256").update(String(sessionId)).digest("hex");
  const variant = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export const COMMAND_CODE_WORKING_DIR = process.cwd();
export const COMMAND_CODE_PROJECT_SLUG = slugifyPath(COMMAND_CODE_WORKING_DIR);

export function buildCommandCodeHeaders(opts: {
  apiKey?: string;
  sessionId?: string;
  accept?: string | null;
  customHeaders?: Record<string, string>;
} = {}): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(metadata.defaultHeaders || {}),
    ...(opts.customHeaders || {}),
    "x-project-slug": COMMAND_CODE_PROJECT_SLUG,
    "x-session-id": opts.sessionId || randomUUID(),
  };
  if (opts.apiKey) {
    headers["Authorization"] = opts.apiKey.startsWith("Bearer ")
      ? opts.apiKey
      : `Bearer ${opts.apiKey}`;
  }
  if (opts.accept) {
    headers["Accept"] = opts.accept;
  }
  return headers;
}
