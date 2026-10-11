import { randomBytes } from "node:crypto";
import { getDatabase } from "../database.js";

export interface CapacityAdapterEntry {
  enabled: boolean;
  roundRobin: boolean;
  models: string[];
}

export interface CapacityAdapterSettings {
  vision: CapacityAdapterEntry;
  audioInput: CapacityAdapterEntry;
  pdf?: CapacityAdapterEntry;
  videoInput?: CapacityAdapterEntry;
  [key: string]: CapacityAdapterEntry | undefined;
}

export const DEFAULT_FALLBACK_MODEL = "oc/mimo-v2.6-flash-free";

export const DEFAULT_CAPACITY_ADAPTER_SETTINGS: CapacityAdapterSettings = {
  vision: {
    enabled: false,
    roundRobin: false,
    models: [],
  },
  audioInput: {
    enabled: false,
    roundRobin: false,
    models: [],
  },
  pdf: {
    enabled: false,
    roundRobin: false,
    models: [],
  },
  videoInput: {
    enabled: false,
    roundRobin: false,
    models: [],
  },
};

export interface EndpointSettings {
  host: string;
  port: number;
  requireApiKey: boolean;
  proxyUrl?: string;
  customHeaders?: Record<string, string>;
}

export const DEFAULT_ENDPOINT_SETTINGS: EndpointSettings = {
  host: "127.0.0.1",
  port: 20127,
  requireApiKey: false,
  proxyUrl: "",
  customHeaders: {},
};

export interface GatewayApiKey {
  id: string;
  key: string;
  name: string;
  isActive: boolean;
  createdAt: number;
  lastUsedAt?: number;
}

function upgradeLegacyModel(m: string): string {
  return m === "oc/mimo-v2.5-free" ? DEFAULT_FALLBACK_MODEL : m;
}

function normalizeCapEntry(entry: any, defaultEntry: CapacityAdapterEntry): CapacityAdapterEntry {
  if (Array.isArray(entry)) {
    return {
      enabled: defaultEntry.enabled,
      roundRobin: false,
      models: entry.map((e) => upgradeLegacyModel(typeof e === "string" ? e : e?.model || "")).filter(Boolean),
    };
  }
  if (entry && typeof entry === "object") {
    return {
      enabled: entry.enabled !== undefined ? Boolean(entry.enabled) : defaultEntry.enabled,
      roundRobin: Boolean(entry.roundRobin),
      models: Array.isArray(entry.models)
        ? entry.models.map((m: any) => upgradeLegacyModel(typeof m === "string" ? m : m?.model || "")).filter(Boolean)
        : [...defaultEntry.models],
    };
  }
  return { ...defaultEntry };
}

export class SettingsRepository {
  public static getSetting<T = any>(key: string, defaultValue?: T): T | undefined {
    const db = getDatabase();
    const row = db.get<{ key: string; value: string }>("SELECT value FROM settings WHERE key = ?", key);
    if (!row) return defaultValue;
    try {
      return JSON.parse(row.value) as T;
    } catch {
      return row.value as unknown as T;
    }
  }

  public static setSetting(key: string, value: any): void {
    const db = getDatabase();
    const strVal = typeof value === "string" ? value : JSON.stringify(value);
    db.run(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      key,
      strVal
    );
  }

  public static getCapacityAdapterSettings(): CapacityAdapterSettings {
    const raw = this.getSetting<any>("capacityAdapter");
    if (!raw || typeof raw !== "object") {
      return JSON.parse(JSON.stringify(DEFAULT_CAPACITY_ADAPTER_SETTINGS));
    }

    return {
      vision: normalizeCapEntry(raw.vision, DEFAULT_CAPACITY_ADAPTER_SETTINGS.vision),
      audioInput: normalizeCapEntry(raw.audioInput, DEFAULT_CAPACITY_ADAPTER_SETTINGS.audioInput),
      pdf: normalizeCapEntry(raw.pdf, DEFAULT_CAPACITY_ADAPTER_SETTINGS.pdf!),
      videoInput: normalizeCapEntry(raw.videoInput, DEFAULT_CAPACITY_ADAPTER_SETTINGS.videoInput!),
    };
  }

  public static setCapacityAdapterSettings(
    settings: Partial<CapacityAdapterSettings>
  ): CapacityAdapterSettings {
    const current = this.getCapacityAdapterSettings();
    const updated: CapacityAdapterSettings = {
      ...current,
    };

    if (settings.vision) {
      updated.vision = {
        enabled: settings.vision.enabled !== undefined ? settings.vision.enabled : current.vision.enabled,
        roundRobin: settings.vision.roundRobin !== undefined ? settings.vision.roundRobin : current.vision.roundRobin,
        models: Array.isArray(settings.vision.models)
          ? settings.vision.models.map(upgradeLegacyModel).filter(Boolean)
          : current.vision.models,
      };
    }

    if (settings.audioInput) {
      updated.audioInput = {
        enabled: settings.audioInput.enabled !== undefined ? settings.audioInput.enabled : current.audioInput.enabled,
        roundRobin: settings.audioInput.roundRobin !== undefined ? settings.audioInput.roundRobin : current.audioInput.roundRobin,
        models: Array.isArray(settings.audioInput.models)
          ? settings.audioInput.models.map(upgradeLegacyModel).filter(Boolean)
          : current.audioInput.models,
      };
    }

    if (settings.pdf) {
      updated.pdf = {
        enabled: settings.pdf.enabled !== undefined ? settings.pdf.enabled : (current.pdf?.enabled ?? false),
        roundRobin: settings.pdf.roundRobin !== undefined ? settings.pdf.roundRobin : (current.pdf?.roundRobin ?? false),
        models: Array.isArray(settings.pdf.models)
          ? settings.pdf.models.map(upgradeLegacyModel).filter(Boolean)
          : (current.pdf?.models ?? []),
      };
    }

    if (settings.videoInput) {
      updated.videoInput = {
        enabled: settings.videoInput.enabled !== undefined ? settings.videoInput.enabled : (current.videoInput?.enabled ?? false),
        roundRobin: settings.videoInput.roundRobin !== undefined ? settings.videoInput.roundRobin : (current.videoInput?.roundRobin ?? false),
        models: Array.isArray(settings.videoInput.models)
          ? settings.videoInput.models.map(upgradeLegacyModel).filter(Boolean)
          : (current.videoInput?.models ?? []),
      };
    }

    this.setSetting("capacityAdapter", updated);
    return updated;
  }

  // --- Endpoint & Connection Settings ---

  public static getEndpointSettings(): EndpointSettings {
    const raw = this.getSetting<any>("endpointSettings");
    if (!raw || typeof raw !== "object") {
      return { ...DEFAULT_ENDPOINT_SETTINGS };
    }
    return {
      host: typeof raw.host === "string" && raw.host.trim() ? raw.host.trim() : DEFAULT_ENDPOINT_SETTINGS.host,
      port: typeof raw.port === "number" && raw.port > 0 ? raw.port : DEFAULT_ENDPOINT_SETTINGS.port,
      requireApiKey: Boolean(raw.requireApiKey),
      proxyUrl: typeof raw.proxyUrl === "string" ? raw.proxyUrl : DEFAULT_ENDPOINT_SETTINGS.proxyUrl,
      customHeaders: raw.customHeaders && typeof raw.customHeaders === "object" ? raw.customHeaders : {},
    };
  }

  public static setEndpointSettings(
    settings: Partial<EndpointSettings>
  ): EndpointSettings {
    const current = this.getEndpointSettings();
    const updated: EndpointSettings = {
      host:
        settings.host !== undefined && typeof settings.host === "string" && settings.host.trim()
          ? settings.host.trim()
          : current.host,
      port:
        settings.port !== undefined && typeof settings.port === "number" && settings.port > 0
          ? settings.port
          : current.port,
      requireApiKey:
        settings.requireApiKey !== undefined ? Boolean(settings.requireApiKey) : current.requireApiKey,
      proxyUrl: settings.proxyUrl !== undefined ? String(settings.proxyUrl) : current.proxyUrl,
      customHeaders:
        settings.customHeaders !== undefined && typeof settings.customHeaders === "object"
          ? settings.customHeaders
          : current.customHeaders,
    };
    this.setSetting("endpointSettings", updated);
    return updated;
  }

  // --- Client Gateway API Keys Management ---

  public static getGatewayApiKeys(): GatewayApiKey[] {
    const raw = this.getSetting<any>("gatewayApiKeys");
    if (!Array.isArray(raw)) {
      return [];
    }
    return raw.map((k: any) => ({
      id: String(k.id),
      key: String(k.key),
      name: String(k.name || "Default Key"),
      isActive: k.isActive !== false,
      createdAt: Number(k.createdAt) || Date.now(),
      lastUsedAt: k.lastUsedAt ? Number(k.lastUsedAt) : undefined,
    }));
  }

  public static createGatewayApiKey(name?: string): GatewayApiKey {
    const keys = this.getGatewayApiKeys();
    const id = "key_" + randomBytes(8).toString("hex");
    const key = "sk-rt-" + randomBytes(24).toString("hex");
    const newKey: GatewayApiKey = {
      id,
      key,
      name: name && typeof name === "string" && name.trim() ? name.trim() : `Key ${keys.length + 1}`,
      isActive: true,
      createdAt: Date.now(),
    };
    keys.unshift(newKey);
    this.setSetting("gatewayApiKeys", keys);
    return newKey;
  }

  public static deleteGatewayApiKey(id: string): boolean {
    const keys = this.getGatewayApiKeys();
    const initialLen = keys.length;
    const filtered = keys.filter((k) => k.id !== id && k.key !== id);
    if (filtered.length !== initialLen) {
      this.setSetting("gatewayApiKeys", filtered);
      return true;
    }
    return false;
  }

  public static toggleGatewayApiKey(id: string): GatewayApiKey | undefined {
    const keys = this.getGatewayApiKeys();
    const index = keys.findIndex((k) => k.id === id || k.key === id);
    if (index === -1) return undefined;
    keys[index].isActive = !keys[index].isActive;
    this.setSetting("gatewayApiKeys", keys);
    return keys[index];
  }
}
