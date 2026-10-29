import { create } from "zustand";

export interface MitmStatusData {
  running: boolean;
  port: number;
  certExists: boolean;
  certTrusted: boolean;
  dnsStatus: Record<string, boolean>;
  orphanedDns: boolean;
  activeDnsCount: number;
  activeDnsTools: string[];
}

interface MitmStatusState {
  status: MitmStatusData | null;
  loading: boolean;
  fetchStatus: () => Promise<MitmStatusData | null>;
}

export const useMitmStatus = create<MitmStatusState>((set) => ({
  status: null,
  loading: false,
  fetchStatus: async () => {
    try {
      set({ loading: true });
      const res = await fetch("/api/mitm/status");
      if (res.ok) {
        const data = await res.json();
        const dnsStatus: Record<string, boolean> = data.dnsStatus || {};
        const activeDnsTools = Object.entries(dnsStatus)
          .filter(([_, active]) => Boolean(active))
          .map(([tool]) => tool);

        const status: MitmStatusData = {
          running: Boolean(data.running),
          port: Number(data.port) || 443,
          certExists: Boolean(data.certExists),
          certTrusted: Boolean(data.certTrusted),
          dnsStatus,
          orphanedDns: Boolean(data.orphanedDns),
          activeDnsCount: activeDnsTools.length,
          activeDnsTools,
        };

        set({ status, loading: false });
        return status;
      }
    } catch {
      // ignore network errors
    }
    set({ loading: false });
    return null;
  },
}));
