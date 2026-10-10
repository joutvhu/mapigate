export interface QuotaItem {
  label: string;
  percent: number;
  resetIn: string;
  used?: string;
}

export interface AccountQuotaCard {
  id: string;
  provider: string;
  providerIcon: string;
  providerColor: string;
  accountName: string;
  isActive: boolean;
  quotas: QuotaItem[];
}

export interface ComboItem {
  id: string;
  name: string;
  models: string[];
  strategy: "round-robin" | "fallback" | "fusion";
}

export interface UsageRequestLog {
  model: string;
  inTok: string;
  outTok: string;
  when: string;
  ok: boolean;
}

export interface UsageHourStat {
  time: string;
  tokens: number;
  requests: number;
  cost: number;
}

export interface TopologyNode {
  id: string;
  name: string;
  x: number;
  y: number;
  color: string;
}

export const DEFAULT_ACCOUNTS_MAP: Record<string, string[]> = {
  antigravity: [
    "loveme05ye@gmail.com",
    "joutvhu@gmail.com",
    "hovangiao16@gmail.com",
    "cssdbcy561@gmail.com",
    "hothixa53@gmail.com",
    "anhoang0907@gmail.com",
    "izxenet.kytog@gmail.com",
  ],
  github: ["Joutvhu", "joutvhu-work"],
  claude: ["Personal Pro Account"],
  openai: ["Main Team Key"],
};

export const DEFAULT_MODELS_MAP: Record<string, string[]> = {
  antigravity: [
    "gemini-3.8-flash-high",
    "gemini-3.8-flash-medium",
    "gemini-3.8-flash-low",
    "gemini-3.8-flash",
    "gemini-3.7-flash-high",
    "gemini-3.7-flash-medium",
    "gemini-3.7-flash-low",
    "gemini-3.6-flash-high",
    "gemini-3.6-flash-medium",
    "gemini-3.6-flash-low",
    "gemini-3.1-pro-high",
    "gemini-pro-agent",
    "gemini-3.1-pro-low",
  ],
  github: [
    "claude-3.5-sonnet",
    "claude-3.7-sonnet",
    "gpt-4o",
    "o1",
    "o3-mini",
  ],
};

export const SEED_QUOTA_ACCOUNTS: AccountQuotaCard[] = [
  {
    id: "ag-1",
    provider: "Antigravity",
    providerIcon: "/providers/antigravity.png",
    providerColor: "#3B82F6",
    accountName: "joutvhu@gmail.com",
    isActive: true,
    quotas: [
      { label: "Gemini (5h)", percent: 100, resetIn: "In 5h 0m", used: "0 / 1,000" },
      { label: "Claude & GPT (5h)", percent: 100, resetIn: "In 5h 0m", used: "0 / 1,000" },
      { label: "Gemini 3.1 Flash Image", percent: 100, resetIn: "In 5h 0m", used: "0 / 1,000" },
      { label: "Gemini (Weekly)", percent: 85, resetIn: "In 6d 13h 2m", used: "143 / 1,000" },
      { label: "Claude & GPT (Weekly)", percent: 100, resetIn: "In 7d 0h 25m", used: "0 / 1,000" },
    ],
  },
  {
    id: "copilot-1",
    provider: "GitHub Copilot",
    providerIcon: "/providers/github.png",
    providerColor: "#60A5FA",
    accountName: "Joutvhu",
    isActive: true,
    quotas: [
      { label: "chat", percent: 100, resetIn: "In 21d 6h 15m", used: "0 / 200" },
      { label: "completions", percent: 100, resetIn: "In 21d 6h 15m", used: "0 / 2,000" },
      { label: "premium_interactions", percent: 0, resetIn: "In 21d 6h 15m", used: "0 / 0" },
    ],
  },
  {
    id: "ag-2",
    provider: "Antigravity",
    providerIcon: "/providers/antigravity.png",
    providerColor: "#3B82F6",
    accountName: "izxenet.kytog@gmail.com",
    isActive: true,
    quotas: [
      { label: "Gemini (5h)", percent: 100, resetIn: "In 5h 0m", used: "0 / 1,000" },
      { label: "Claude & GPT (5h)", percent: 100, resetIn: "In 5h 0m", used: "0 / 1,000" },
      { label: "Gemini 3.1 Flash Image", percent: 100, resetIn: "In 5h 0m", used: "0 / 1,000" },
      { label: "Gemini (Weekly)", percent: 95, resetIn: "In 6d 7h 48m", used: "54 / 1,000" },
      { label: "Claude & GPT (Weekly)", percent: 100, resetIn: "In 7d 0h 25m", used: "0 / 1,000" },
    ],
  },
  {
    id: "ag-3",
    provider: "Antigravity",
    providerIcon: "/providers/antigravity.png",
    providerColor: "#3B82F6",
    accountName: "hovang.aofb@gmail.com",
    isActive: false,
    quotas: [
      { label: "Gemini (5h)", percent: 97, resetIn: "In 2h 50m", used: "33 / 1,000" },
      { label: "Claude & GPT (5h)", percent: 100, resetIn: "In 5h 0m", used: "0 / 1,000" },
      { label: "Gemini 3.1 Flash Image", percent: 0, resetIn: "In 18h 53m", used: "995 / 1,000" },
      { label: "Gemini (Weekly)", percent: 0, resetIn: "In 18h 53m", used: "995 / 1,000" },
      { label: "Claude & GPT (Weekly)", percent: 78, resetIn: "In 4d 16h 28m", used: "217 / 1,000" },
    ],
  },
];

export const DEFAULT_SEED_COMBOS: ComboItem[] = [
  {
    id: "combo-pro",
    name: "combo-pro",
    models: ["ag/mimo-v2.5-pro", "ag/gemini-pro-agent", "ki/claude-sonnet-4.5-thinking-agent", "+1 more"],
    strategy: "round-robin",
  },
  {
    id: "combo-high",
    name: "combo-high",
    models: ["ag/mimo-v2.5", "ag/gemini-3.1-flash-agent"],
    strategy: "round-robin",
  },
  {
    id: "combo-low",
    name: "combo-low",
    models: ["ag/mimo-v2-mini", "ag/gemini-2.5-pro", "ag/gemini-3.1-pro-low", "+1 more"],
    strategy: "round-robin",
  },
  {
    id: "combo-medium",
    name: "combo-medium",
    models: ["ag/gemini-3.1-flash-low", "ag/mimo-v2-pro", "gc/gemini-3.1-flash-preview", "+2 more"],
    strategy: "round-robin",
  },
  {
    id: "combo-auto",
    name: "combo-auto",
    models: ["ag/claude-sonnet-4-6", "ag/claude-opus-4-6-thinking", "ag/gemini-pro-agent", "+17 more"],
    strategy: "round-robin",
  },
];

export const SEED_HOURLY_USAGE: UsageHourStat[] = [
  { time: "00:00", tokens: 1.2, requests: 5, cost: 0.01 },
  { time: "02:00", tokens: 0.4, requests: 2, cost: 0.0 },
  { time: "04:00", tokens: 0.1, requests: 1, cost: 0.0 },
  { time: "06:00", tokens: 3.5, requests: 12, cost: 0.04 },
  { time: "08:00", tokens: 8.2, requests: 22, cost: 0.08 },
  { time: "10:00", tokens: 24.4, requests: 76, cost: 0.32 },
  { time: "12:00", tokens: 18.1, requests: 54, cost: 0.21 },
  { time: "14:00", tokens: 32.8, requests: 92, cost: 0.45 },
  { time: "16:00", tokens: 26.3, requests: 81, cost: 0.36 },
  { time: "18:00", tokens: 19.6, requests: 62, cost: 0.25 },
  { time: "20:00", tokens: 28.4, requests: 85, cost: 0.38 },
  { time: "22:00", tokens: 12.5, requests: 35, cost: 0.16 },
];

export const SEED_REQUESTS: UsageRequestLog[] = [
  { model: "gemini-1.5-flash", inTok: "154,589", outTok: "4,464", when: "Just now", ok: true },
  { model: "claude-3-7-sonnet", inTok: "48,210", outTok: "2,190", when: "2m ago", ok: true },
  { model: "deepseek-r1", inTok: "62,400", outTok: "3,810", when: "5m ago", ok: true },
  { model: "gpt-4o", inTok: "31,800", outTok: "1,240", when: "9m ago", ok: true },
  { model: "gemini-1.5-flash", inTok: "153,305", outTok: "1,105", when: "14m ago", ok: true },
  { model: "claude-3-5-haiku", inTok: "12,400", outTok: "680", when: "18m ago", ok: true },
  { model: "gemini-1.5-flash", inTok: "152,793", outTok: "344", when: "23m ago", ok: true },
  { model: "deepseek-chat", inTok: "25,100", outTok: "890", when: "29m ago", ok: true },
];

export const TOPOLOGY_NODES: TopologyNode[] = [
  { id: "antigravity", name: "Antigravity", x: 130, y: 70, color: "#3B82F6" },
  { id: "gemini", name: "Gemini", x: 240, y: 50, color: "#38BDF8" },
  { id: "openai", name: "OpenAI", x: 350, y: 50, color: "#10B981" },
  { id: "copilot", name: "GitHub Copilot", x: 130, y: 170, color: "#60A5FA" },
  { id: "claude", name: "Anthropic Claude", x: 350, y: 170, color: "#D97706" },
];
