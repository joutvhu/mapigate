import { MitmRepository } from "../../storage/repositories/mitmRepo.js";
import { getMapigateBaseUrl } from "../../shared/constants/cliTools.js";
import { serverLifecycle } from "../lifecycle.js";

export interface RouterTargetInfo {
  baseUrl: string;
  isRemote: boolean;
  hasApiKey: boolean;
  effectiveBaseUrl: string;
}

export function getCurrentRouterTarget(): RouterTargetInfo {
  const target = MitmRepository.getRouterTarget();
  let defaultLocal = "";
  try {
    defaultLocal = getMapigateBaseUrl(serverLifecycle.getPort());
  } catch {
    defaultLocal = getMapigateBaseUrl();
  }

  return {
    baseUrl: target.baseUrl || "",
    isRemote: target.isRemote,
    hasApiKey: Boolean(target.apiKey),
    effectiveBaseUrl: target.baseUrl || defaultLocal,
  };
}

export async function testRouterTargetConnection(
  targetUrl?: string,
  apiKey?: string
): Promise<{ success: boolean; message: string; modelCount?: number; latencyMs?: number }> {
  const current = MitmRepository.getRouterTarget();
  const urlToTest = (targetUrl !== undefined ? targetUrl : current.baseUrl) || "";
  const keyToUse = apiKey !== undefined ? apiKey : (current.apiKey || "");

  let defaultLocal = "";
  try {
    defaultLocal = getMapigateBaseUrl(serverLifecycle.getPort());
  } catch {
    defaultLocal = getMapigateBaseUrl();
  }
  const cleanUrl = (urlToTest.trim() || defaultLocal).replace(/\/+$/, "");

  const start = Date.now();
  try {
    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (keyToUse) {
      headers.Authorization = `Bearer ${keyToUse.trim()}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(`${cleanUrl}/v1/models`, {
      method: "GET",
      headers,
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    const latencyMs = Date.now() - start;

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return {
        success: false,
        latencyMs,
        message: `HTTP ${res.status}: ${errText.slice(0, 150) || res.statusText}`,
      };
    }

    const data = (await res.json().catch(() => ({}))) as any;
    const modelCount = Array.isArray(data?.data)
      ? data.data.length
      : Array.isArray(data)
      ? data.length
      : 0;

    return {
      success: true,
      latencyMs,
      modelCount,
      message: `Connected successfully (${modelCount} models available, ${latencyMs}ms)`,
    };
  } catch (error: any) {
    const latencyMs = Date.now() - start;
    return {
      success: false,
      latencyMs,
      message: error?.name === "AbortError" ? "Connection timed out (6s)" : (error?.message || "Failed to connect"),
    };
  }
}

export async function fetchRemoteModels(): Promise<Array<{ id: string; name?: string; provider?: string }>> {
  const current = MitmRepository.getRouterTarget();
  if (!current.baseUrl) {
    return [];
  }

  const cleanUrl = current.baseUrl.replace(/\/+$/, "");
  const headers: Record<string, string> = { Accept: "application/json" };
  if (current.apiKey) {
    headers.Authorization = `Bearer ${current.apiKey.trim()}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(`${cleanUrl}/v1/models`, {
      method: "GET",
      headers,
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (!res.ok) return [];
    const data = (await res.json().catch(() => ({}))) as any;
    const list = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
    return list.map((item: any) => ({
      id: typeof item === "string" ? item : item?.id || "",
      name: item?.name || item?.id || "",
      provider: item?.owned_by || item?.provider || "remote",
    })).filter((m: any) => Boolean(m.id));
  } catch {
    return [];
  }
}
