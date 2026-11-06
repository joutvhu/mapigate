import crypto from "node:crypto";
import http2 from "node:http2";
import { buildCursorHeaders } from "./cursorChecksum.js";
import { decodeMessage, type DecodedFields } from "./cursorWire.js";

const FETCH_TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 5 * 60 * 1000;

const MODEL_ID_FIELD = 1;
const DISPLAY_MODEL_ID_FIELD = 3;
const DISPLAY_NAME_FIELD = 4;
const DISPLAY_NAME_SHORT_FIELD = 5;
const RESPONSE_MODELS_FIELD = 1;

const RESPONSE_AVAILABLE_MODELS_FIELD = 2;
const AVAILABLE_MODEL_NAME_FIELD = 1;
const AVAILABLE_MODEL_DEFAULT_ON_FIELD = 2;
const AVAILABLE_MODEL_IS_CHAT_ONLY_FIELD = 4;
const AVAILABLE_MODEL_SUPPORTS_AGENT_FIELD = 5;
const AVAILABLE_MODEL_IS_HIDDEN_FIELD = 35;

export interface CursorModelInfo {
  id: string;
  name: string;
  defaultOn?: boolean;
  isChatOnly?: boolean;
  supportsAgent?: boolean;
  isHidden?: boolean;
}

const catalogCache = new Map<string, { expiresAt: number; models: CursorModelInfo[] }>();

function cacheKey(credentials: { accessToken?: string; machineId?: string }): string {
  const seed = [credentials.machineId, credentials.accessToken].filter(Boolean).join(":");
  if (!seed) return "cursor-anonymous";
  return crypto.createHash("sha256").update(`cursor:${seed}`).digest("hex");
}

function firstString(fields: DecodedFields, fieldNumber: number): string {
  const value = fields.get(fieldNumber)?.[0]?.value;
  if (!value || typeof value === "number") return "";
  return Buffer.from(value).toString("utf8");
}

function firstBool(fields: DecodedFields, fieldNumber: number): boolean {
  const value = fields.get(fieldNumber)?.[0]?.value;
  return value === 1;
}

export function parseCursorUsableModels(payload: Uint8Array): Array<{ id: string; name: string }> {
  const response = decodeMessage(payload);
  const seen = new Set<string>();
  const models: Array<{ id: string; name: string }> = [];

  for (const entry of response.get(RESPONSE_MODELS_FIELD) || []) {
    if (!entry?.value || typeof entry.value === "number") continue;
    const detail = decodeMessage(entry.value);
    const id = firstString(detail, MODEL_ID_FIELD).trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);

    const name = (
      firstString(detail, DISPLAY_NAME_FIELD) ||
      firstString(detail, DISPLAY_NAME_SHORT_FIELD) ||
      firstString(detail, DISPLAY_MODEL_ID_FIELD) ||
      id
    ).trim();
    models.push({ id, name });
  }

  return models;
}

export function parseCursorAvailableModels(payload: Uint8Array): CursorModelInfo[] {
  const response = decodeMessage(payload);
  const seen = new Set<string>();
  const models: CursorModelInfo[] = [];

  for (const entry of response.get(RESPONSE_AVAILABLE_MODELS_FIELD) || []) {
    if (!entry?.value || typeof entry.value === "number") continue;
    const fields = decodeMessage(entry.value);
    const id = firstString(fields, AVAILABLE_MODEL_NAME_FIELD).trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);

    models.push({
      id,
      name: id,
      defaultOn: firstBool(fields, AVAILABLE_MODEL_DEFAULT_ON_FIELD),
      isChatOnly: firstBool(fields, AVAILABLE_MODEL_IS_CHAT_ONLY_FIELD),
      supportsAgent: firstBool(fields, AVAILABLE_MODEL_SUPPORTS_AGENT_FIELD),
      isHidden: firstBool(fields, AVAILABLE_MODEL_IS_HIDDEN_FIELD),
    });
  }

  return models;
}

export function mergeCursorModelFlags(
  models: Array<{ id: string; name: string }>,
  payload: Uint8Array
): CursorModelInfo[] {
  const available = parseCursorAvailableModels(payload);
  if (!available.length || !Array.isArray(models)) return models;
  const flagsById = new Map(available.map((model) => [model.id, model]));
  return models.map((model) => {
    const flags = flagsById.get(model.id);
    return flags ? { ...model, ...flags } : model;
  });
}

export function resolveAutoModelSelection(
  models: CursorModelInfo[]
): { modelId: string; matchedBy: string } | null {
  if (!Array.isArray(models) || models.length === 0) return null;
  const usable = models.filter((model) => model.supportsAgent && !model.isChatOnly && !model.isHidden);
  if (usable.length === 0) return null;
  const preferred = usable.find((model) => model.defaultOn) || usable[0];
  return {
    modelId: preferred.id,
    matchedBy: "auto-default",
  };
}

export function http2PostProto(
  url: string,
  headers: Record<string, string>,
  body: Uint8Array,
  signal?: AbortSignal,
  timeoutMs = FETCH_TIMEOUT_MS
): Promise<{ status: number; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const client = http2.connect(`https://${urlObj.host}`);
    const chunks: Buffer[] = [];
    let responseHeaders: Record<string, any> = {};
    let settled = false;

    const finish = (fn: (...args: any[]) => void) => (...args: any[]) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      try {
        client.close();
      } catch {}
      fn(...args);
    };

    const timeoutId = setTimeout(
      finish(() => reject(new Error("Cursor GetUsableModels timed out"))),
      timeoutMs
    );

    client.on("error", finish(reject));

    const req = client.request({
      ":method": "POST",
      ":path": urlObj.pathname,
      ":authority": urlObj.host,
      ":scheme": "https",
      ...headers,
    });

    req.on("response", (hdrs) => {
      responseHeaders = hdrs;
    });
    req.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });
    req.on(
      "end",
      finish(() => {
        resolve({
          status: Number(responseHeaders[":status"] || 0),
          body: Buffer.concat(chunks),
        });
      })
    );
    req.on("error", finish(reject));

    if (signal) {
      const onAbort = finish(() => reject(new Error("Request aborted")));
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort, { once: true });
    }

    req.end(body && body.length ? Buffer.from(body) : undefined);
  });
}

export async function fetchCursorCatalog(
  credentials: { accessToken?: string; machineId?: string; ghostMode?: boolean },
  signal?: AbortSignal,
  timeoutMs = FETCH_TIMEOUT_MS
): Promise<CursorModelInfo[]> {
  const accessToken = credentials?.accessToken;
  const machineId = credentials?.machineId;
  if (!accessToken) throw new Error("Cursor access token is required");

  const url = "https://agent.api5.cursor.sh/agent.v1.AgentService/GetUsableModels";
  const headers: Record<string, string> = {
    ...buildCursorHeaders(accessToken, machineId, credentials?.ghostMode !== false),
    accept: "application/proto",
    "content-type": "application/proto",
  };
  delete headers["connect-accept-encoding"];
  delete headers["connect-protocol-version"];

  const response = await http2PostProto(url, headers, new Uint8Array(), signal, timeoutMs);
  if (response.status !== 200) {
    const error: any = new Error(`Cursor GetUsableModels returned ${response.status}`);
    error.status = response.status;
    throw error;
  }

  return mergeCursorModelFlags(parseCursorUsableModels(new Uint8Array(response.body)), response.body);
}

export async function resolveCursorModels(
  credentials: { accessToken?: string; machineId?: string; ghostMode?: boolean },
  options: { forceRefresh?: boolean; signal?: AbortSignal } = {}
): Promise<{ models: CursorModelInfo[] } | null> {
  if (!credentials?.accessToken) return null;

  const key = cacheKey(credentials);
  const now = Date.now();
  if (!options.forceRefresh) {
    const cached = catalogCache.get(key);
    if (cached && cached.expiresAt > now) return { models: cached.models };
  }

  try {
    const models = await fetchCursorCatalog(credentials, options.signal);
    if (!models?.length) return null;
    catalogCache.set(key, { expiresAt: now + CACHE_TTL_MS, models });
    return { models };
  } catch {
    return null;
  }
}

export function clearCursorModelCache(): void {
  catalogCache.clear();
}
