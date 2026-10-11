/**
 * Utility functions for quota parsing, calculations, and time formatting
 */

export function parseResetTime(resetValue: any): number | null {
  if (!resetValue) return null;

  try {
    if (resetValue instanceof Date) {
      const t = resetValue.getTime();
      return Number.isFinite(t) ? t : null;
    }

    if (typeof resetValue === "number") {
      if (!Number.isFinite(resetValue)) return null;
      // If timestamp is in seconds (< 1e12), convert to ms
      return resetValue < 1e12 ? Math.round(resetValue * 1000) : Math.round(resetValue);
    }

    if (typeof resetValue === "string") {
      const trimmed = resetValue.trim();
      if (!trimmed) return null;
      if (/^\d+$/.test(trimmed)) {
        const num = Number(trimmed);
        return num < 1e12 ? Math.round(num * 1000) : Math.round(num);
      }
      const parsed = Date.parse(trimmed);
      return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
  } catch {
    return null;
  }
}

export function toFiniteNumber(value: any, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export function calculatePercentage(used: number, total: number): number {
  if (!Number.isFinite(total) || total <= 0) return 0;
  if (!Number.isFinite(used) || used < 0) used = 0;
  const remaining = Math.max(0, total - used);
  const fraction = (remaining / total) * 100;
  return Math.min(100, Math.max(0, Math.round(fraction)));
}

export function formatResetTime(date: number | string | Date | null): string {
  const timestamp = parseResetTime(date);
  if (timestamp === null) return "-";

  const now = Date.now();
  const diff = timestamp - now;

  if (diff <= 0) {
    return "Expired";
  }

  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);

  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${Math.max(1, minutes)}m`;
}

export function formatResetTimeDisplay(date: number | string | Date | null): string | null {
  const timestamp = parseResetTime(date);
  if (timestamp === null) return null;

  try {
    const resetDate = new Date(timestamp);
    const now = new Date();
    const isToday = resetDate.toDateString() === now.toDateString();
    const isTomorrow = resetDate.toDateString() === new Date(now.getTime() + 86400000).toDateString();

    const timeStr = resetDate.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });

    if (isToday) return `Today, ${timeStr}`;
    if (isTomorrow) return `Tomorrow, ${timeStr}`;

    return resetDate.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return null;
  }
}

export function getStatusColor(percentage: number): {
  text: string;
  bg: string;
  bgLight: string;
  border: string;
  emoji: string;
} {
  if (percentage >= 50) {
    return {
      text: "text-emerald-400",
      bg: "bg-emerald-500",
      bgLight: "bg-emerald-500/10",
      border: "border-emerald-500/20",
      emoji: "🟢",
    };
  }

  if (percentage > 0) {
    return {
      text: "text-amber-400",
      bg: "bg-amber-500",
      bgLight: "bg-amber-500/10",
      border: "border-amber-500/20",
      emoji: "🟡",
    };
  }

  return {
    text: "text-red-400",
    bg: "bg-red-500",
    bgLight: "bg-red-500/10",
    border: "border-red-500/20",
    emoji: "🔴",
  };
}
