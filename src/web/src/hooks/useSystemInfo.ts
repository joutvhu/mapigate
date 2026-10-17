import { create } from "zustand";

export interface SystemInfo {
  dataDir: string;
  dbPath: string;
  isDevelopmentMode: boolean;
  appName: string;
  version: string;
  port: number;
  host: string;
}

interface SystemInfoState {
  info: SystemInfo | null;
  loading: boolean;
  fetchSystemInfo: () => Promise<SystemInfo | null>;
}

export const useSystemInfo = create<SystemInfoState>((set) => ({
  info: null,
  loading: false,
  fetchSystemInfo: async () => {
    try {
      set({ loading: true });
      const res = await fetch("/api/settings/system-info");
      if (res.ok) {
        const data = await res.json();
        const windowPort =
          typeof window !== "undefined" && window.location.port
            ? Number(window.location.port)
            : undefined;
        // In dev mode (e.g. Vite on 5173), prefer data.port returned by Mapigate backend
        const effectivePort =
          data.port || (windowPort && windowPort !== 5173 ? windowPort : 20127);
        const host =
          data.host ||
          (typeof window !== "undefined" && window.location.hostname
            ? window.location.hostname
            : "127.0.0.1");

        const fullInfo: SystemInfo = {
          dataDir: data.dataDir || "",
          dbPath: data.dbPath || "",
          isDevelopmentMode: Boolean(data.isDevelopmentMode),
          appName: data.appName || "Mapigate",
          version: data.version || "",
          port: effectivePort,
          host,
        };
        set({ info: fullInfo, loading: false });
        return fullInfo;
      }
    } catch {
      // ignore
    }
    set({ loading: false });
    return null;
  },
}));
