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
    enabled: true,
    roundRobin: false,
    models: [DEFAULT_FALLBACK_MODEL],
  },
  audioInput: {
    enabled: true,
    roundRobin: false,
    models: [DEFAULT_FALLBACK_MODEL],
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

function upgradeLegacyModel(m: string): string {
  return m === "oc/mimo-v2.5-free" ? DEFAULT_FALLBACK_MODEL : m;
}

function normalizeCapEntry(entry: any, defaultEntry: CapacityAdapterEntry): CapacityAdapterEntry {
  if (Array.isArray(entry)) {
    return {
      enabled: true,
      roundRobin: false,
      models: entry.map((e) => upgradeLegacyModel(typeof e === "string" ? e : e?.model || "")).filter(Boolean),
    };
  }
  if (entry && typeof entry === "object") {
    return {
      enabled: entry.enabled !== false,
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
}
