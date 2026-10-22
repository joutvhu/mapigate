/**
 * Multimodal Capacity Adapter
 *
 * Automatically detects multimodal inputs (vision, PDF, audio) and prepends
 * capable fallback models from the adapter pool when the requested model(s)
 * lack the necessary modality.
 */

import { getCapabilitiesForModel } from "../capabilities/index.js";
import {
  SettingsRepository,
  type CapacityAdapterSettings,
  type CapacityAdapterEntry,
  DEFAULT_FALLBACK_MODEL,
} from "../../storage/repositories/settingsRepo.js";

export const CAPABILITY_KEYS = ["vision", "pdf", "audioInput", "videoInput"] as const;
export const HARD_CAPS = new Set<string>(CAPABILITY_KEYS);

const CHARS_PER_TOKEN = 4;
const HEAD_KEEP = 6;

function upgradeLegacyModel(m: string): string {
  return m === "oc/mimo-v2.5-free" ? DEFAULT_FALLBACK_MODEL : m;
}

/**
 * Returns trailing user turns (items after the last assistant/model turn).
 * Only the active user turn should trigger capacity adaptation.
 */
function trailingUserItems(arr: any[]): any[] {
  if (!Array.isArray(arr) || arr.length === 0) return [];
  const isAssistant = (r: string) => r === "assistant" || r === "model";
  let i = arr.length - 1;
  while (i >= 0 && !isAssistant(arr[i]?.role)) i--;
  return arr.slice(i + 1);
}

/**
 * Detect which modalities a request requires.
 * Scans trailing user messages for images, PDFs, audio, video.
 */
export function detectRequiredCapabilities(body: any): Set<string> {
  const required = new Set<string>();
  if (!body || typeof body !== "object") return required;

  const addByMime = (mime?: string | null) => {
    if (typeof mime !== "string") return;
    if (mime.startsWith("image/")) required.add("vision");
    else if (mime === "application/pdf") required.add("pdf");
    else if (mime.startsWith("audio/")) required.add("audioInput");
    else if (mime.startsWith("video/")) required.add("videoInput");
  };

  const scanBlock = (b: any) => {
    if (!b || typeof b !== "object") return;
    const t = b.type;
    if (t === "image_url" || t === "image" || t === "input_image") required.add("vision");
    if (t === "input_audio" || t === "audio_url" || t === "audio") required.add("audioInput");
    if (t === "input_video" || t === "video_url" || t === "video") required.add("videoInput");
    if (t === "file" || t === "document" || t === "input_file") {
      let fmime: string | null = null;
      if (b.input_audio?.format) fmime = `audio/${b.input_audio.format}`;
      else if (b.file?.file_data) fmime = String(b.file.file_data).match(/^data:([^;,]+)/)?.[1] || null;
      else if (b.source?.media_type) fmime = b.source.media_type;
      else if (b.source?.data) fmime = String(b.source.data).match(/^data:([^;,]+)/)?.[1] || null;
      if (fmime) addByMime(fmime);
      else required.add("pdf");
    }

    addByMime(b.inlineData?.mimeType || b.fileData?.mimeType);
  };

  const scanContent = (content: any) => {
    if (Array.isArray(content)) {
      for (const b of content) scanBlock(b);
    }
  };

  const scanMessage = (m: any) => {
    if (!m || typeof m !== "object") return;

    if (Array.isArray(m.images) && m.images.length > 0) {
      required.add("vision");
    }

    const attachments = m.experimental_attachments || m.attachments;
    if (Array.isArray(attachments)) {
      for (const att of attachments) {
        if (!att) continue;
        const mime =
          att.contentType ||
          att.mediaType ||
          (typeof att.url === "string" ? att.url.match(/^data:([^;,]+)/)?.[1] : null);
        if (mime) addByMime(mime);
        else if (att.url || att.data) required.add("vision");
      }
    }

    if (m.image_url || m.image) required.add("vision");
    if (m.audio_url || m.audio) required.add("audioInput");

    scanContent(m.content);

    if (typeof m.content === "string") {
      if (m.content.includes("data:image/")) required.add("vision");
      else if (m.content.includes("data:audio/")) required.add("audioInput");
      else if (m.content.includes("data:application/pdf")) required.add("pdf");
    }
  };

  if (Array.isArray(body.messages)) {
    for (const m of trailingUserItems(body.messages)) scanMessage(m);
  }
  if (Array.isArray(body.input)) {
    for (const it of trailingUserItems(body.input)) scanContent(it.content);
  }
  const contents = body.contents || body.request?.contents;
  if (Array.isArray(contents)) {
    for (const c of trailingUserItems(contents)) scanContent(c.parts);
  }

  return required;
}

export function getCapacityAdapterConfig(
  cap: string,
  settings?: CapacityAdapterSettings | null
): CapacityAdapterEntry {
  const s = settings || SettingsRepository.getCapacityAdapterSettings();
  const entry = s[cap];
  if (entry) return entry;
  return { enabled: false, roundRobin: false, models: [] };
}

export function getCapacityAdapterModels(settings?: CapacityAdapterSettings | null): string[] {
  const s = settings || SettingsRepository.getCapacityAdapterSettings();
  const seen = new Set<string>();
  const models: string[] = [];
  for (const cap of CAPABILITY_KEYS) {
    const entry = getCapacityAdapterConfig(cap, s);
    if (!entry.enabled) continue;
    for (const m of entry.models) {
      const upgraded = upgradeLegacyModel(m);
      if (!seen.has(upgraded)) {
        seen.add(upgraded);
        models.push(upgraded);
      }
    }
  }
  return models;
}

export function getCapacityAdapterStrategy(
  cap: string,
  settings?: CapacityAdapterSettings | null
): "round-robin" | "fallback" {
  const { enabled, roundRobin } = getCapacityAdapterConfig(cap, settings);
  return enabled && roundRobin ? "round-robin" : "fallback";
}

export function getActiveAdapterStrategy(
  requiredCapabilities: Set<string> | string[],
  settings?: CapacityAdapterSettings | null
): "round-robin" | "fallback" {
  const reqSet = requiredCapabilities instanceof Set ? requiredCapabilities : new Set(requiredCapabilities);
  const hard = [...reqSet].filter((c) => HARD_CAPS.has(c));
  for (const cap of hard) {
    const { enabled, models } = getCapacityAdapterConfig(cap, settings);
    if (!enabled || models.length === 0) continue;
    return getCapacityAdapterStrategy(cap, settings);
  }
  return "fallback";
}

export function modelSatisfies(modelStr: string, requiredHard: string[]): boolean {
  const slash = modelStr.indexOf("/");
  const provider = slash > 0 ? modelStr.slice(0, slash) : "";
  const model = slash > 0 ? modelStr.slice(slash + 1) : modelStr;
  const caps = getCapabilitiesForModel(provider, model);
  return requiredHard.every((c) => caps[c] === true);
}

/**
 * Prepend capacity adapter pool models when none of the requested models
 * satisfy the required hard capabilities.
 */
export function augmentModelsWithCapacityAdapter(
  models: string[],
  requiredCapabilities: Set<string> | string[],
  settings?: CapacityAdapterSettings | null
): string[] {
  const reqSet = requiredCapabilities instanceof Set ? requiredCapabilities : new Set(requiredCapabilities);
  const hard = [...reqSet].filter((c) => HARD_CAPS.has(c));

  if (hard.length === 0 || !Array.isArray(models) || models.length === 0) {
    return models;
  }

  // If any requested model already satisfies all required hard capabilities, don't intervene
  if (models.some((m) => modelSatisfies(m, hard))) {
    return models;
  }

  const pool = getCapacityAdapterModels(settings).filter(
    (m) => !models.includes(m) && modelSatisfies(m, hard)
  );

  if (pool.length === 0) return models;

  return [...pool, ...models];
}

function blockLength(content: any): number {
  if (typeof content === "string") return content.length;
  if (Array.isArray(content)) {
    return content.reduce((sum, b) => sum + (typeof b?.text === "string" ? b.text.length : 50), 0);
  }
  return 0;
}

/**
 * Trims conversation history by dropping the middle turns to fit a target context window.
 * Keeps system instructions (head) and the current active user turn (tail).
 */
export function stripHistoryForContext(body: any, contextWindow = 200000): any {
  if (!body || typeof body !== "object") return body;

  const key = Array.isArray(body.messages)
    ? "messages"
    : Array.isArray(body.input)
    ? "input"
    : Array.isArray(body.contents)
    ? "contents"
    : null;

  if (!key) return body;
  const arr: any[] = body[key];
  if (!arr || arr.length === 0) return body;

  const isSystem = (r: string) => r === "system" || r === "developer";
  const systemMsgs = arr.filter((m) => isSystem(m?.role));
  const rest = arr.filter((m) => !isSystem(m?.role));
  if (rest.length === 0) return body;

  const isAssistant = (r: string) => r === "assistant" || r === "model";
  let i = rest.length - 1;
  while (i >= 0 && !isAssistant(rest[i]?.role)) i--;
  const tail = rest.slice(i + 1);
  const older = rest.slice(0, i + 1);
  if (older.length === 0) return body;

  const contentOf = (m: any) => m.content ?? m.parts;
  const budgetChars = contextWindow * 0.8 * CHARS_PER_TOKEN;
  const totalChars = arr.reduce((s, m) => s + blockLength(contentOf(m)), 0);
  if (totalChars <= budgetChars) return body;

  const headKept = older.slice(0, HEAD_KEEP);
  let total = systemMsgs.concat(headKept, tail).reduce((s, m) => s + blockLength(contentOf(m)), 0);

  const head = [...headKept];
  while (total > budgetChars && head.length > 0) {
    const dropped = head.pop();
    total -= blockLength(contentOf(dropped));
  }

  if (head.length === older.length) return body;
  return { ...body, [key]: [...systemMsgs, ...head, ...tail] };
}

export function withCapacityAdapterStripping<T extends (body: any, modelStr: string, ...rest: any[]) => any>(
  handleSingleModel: T,
  adapterModels: string[]
): T {
  const adapterSet = new Set(adapterModels);
  if (adapterSet.size === 0) return handleSingleModel;

  return ((body: any, modelStr: string, ...rest: any[]) => {
    if (adapterSet.has(modelStr)) {
      const slash = modelStr.indexOf("/");
      const provider = slash > 0 ? modelStr.slice(0, slash) : "";
      const model = slash > 0 ? modelStr.slice(slash + 1) : modelStr;
      const { contextWindow } = getCapabilitiesForModel(provider, model);
      body = stripHistoryForContext(body, contextWindow);
    }
    return handleSingleModel(body, modelStr, ...rest);
  }) as T;
}
