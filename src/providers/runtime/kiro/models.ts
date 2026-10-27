import type { RegistryModel } from "../../core/types.js";

export const models: RegistryModel[] = [
  {"id":"claude-opus-5.5","name":"Claude Opus 5.5","isDefault":false},
  {"id":"claude-opus-5.5-thinking","name":"Claude Opus 5.5 (Thinking)","isDefault":false},
  {"id":"claude-opus-5.5-agentic","name":"Claude Opus 5.5 (Agentic)","isDefault":false},
  {"id":"claude-opus-5.5-thinking-agentic","name":"Claude Opus 5.5 (Thinking + Agentic)","isDefault":false},
  {"id":"claude-opus-5","name":"Claude Opus 5","isDefault":false},
  {"id":"claude-opus-5-thinking","name":"Claude Opus 5 (Thinking)","isDefault":false},
  {"id":"claude-opus-5-agentic","name":"Claude Opus 5 (Agentic)","isDefault":false},
  {"id":"claude-opus-5-thinking-agentic","name":"Claude Opus 5 (Thinking + Agentic)","isDefault":false},
  {"id":"claude-opus-4.8","name":"Claude Opus 4.8","isDefault":false},
  {"id":"claude-opus-4.8-thinking","name":"Claude Opus 4.8 (Thinking)","isDefault":false},
  {"id":"claude-opus-4.8-agentic","name":"Claude Opus 4.8 (Agentic)","isDefault":false},
  {"id":"claude-opus-4.8-thinking-agentic","name":"Claude Opus 4.8 (Thinking + Agentic)","isDefault":false},
  {"id":"claude-opus-4.7","name":"Claude Opus 4.7","isDefault":false},
  {"id":"claude-opus-4.7-thinking","name":"Claude Opus 4.7 (Thinking)","isDefault":false},
  {"id":"claude-opus-4.7-agentic","name":"Claude Opus 4.7 (Agentic)","isDefault":false},
  {"id":"claude-opus-4.7-thinking-agentic","name":"Claude Opus 4.7 (Thinking + Agentic)","isDefault":false},
  {"id":"claude-opus-4.5","name":"Claude Opus 4.5","isDefault":false},
  {"id":"claude-opus-4.5-thinking","name":"Claude Opus 4.5 (Thinking)","isDefault":false},
  {"id":"claude-opus-4.5-agentic","name":"Claude Opus 4.5 (Agentic)","isDefault":false},
  {"id":"claude-opus-4.5-thinking-agentic","name":"Claude Opus 4.5 (Thinking + Agentic)","isDefault":false},
  {"id":"claude-sonnet-5","name":"Claude Sonnet 5","isDefault":false},
  {"id":"claude-sonnet-4.5","name":"Claude Sonnet 4.5","isDefault":false},
  {"id":"claude-haiku-4.5","name":"Claude Haiku 4.5","isDefault":false},
  {"id":"deepseek-3.2","name":"DeepSeek 3.2","isDefault":false},
  {"id":"qwen3-coder-next","name":"Qwen3 Coder Next","isDefault":false},
  {"id":"glm-5","name":"GLM 5","isDefault":false},
  {"id":"minimax-m2.5","name":"MiniMax M2.5","isDefault":false},
  {"id":"gpt-5.6-sol","name":"GPT 5.6 Sol","upstreamModelId":"gpt-5.6-sol","isDefault":false,"contextLength":272000},
  {"id":"gpt-5.6-terra","name":"GPT 5.6 Terra","upstreamModelId":"gpt-5.6-terra","isDefault":false,"contextLength":272000},
  {"id":"gpt-5.6-luna","name":"GPT 5.6 Luna","upstreamModelId":"gpt-5.6-luna","isDefault":false,"contextLength":272000},
  {"id":"claude-sonnet-5-thinking","name":"Claude Sonnet 5 (Thinking)","isDefault":false},
  {"id":"claude-sonnet-4.5-thinking","name":"Claude Sonnet 4.5 (Thinking)","isDefault":false},
  {"id":"claude-haiku-4.5-thinking","name":"Claude Haiku 4.5 (Thinking)","isDefault":false},
  {"id":"gpt-5.6-sol-thinking","name":"GPT 5.6 Sol (Thinking)","upstreamModelId":"gpt-5.6-sol","isDefault":false,"contextLength":272000},
  {"id":"gpt-5.6-terra-thinking","name":"GPT 5.6 Terra (Thinking)","upstreamModelId":"gpt-5.6-terra","isDefault":false,"contextLength":272000},
  {"id":"gpt-5.6-luna-thinking","name":"GPT 5.6 Luna (Thinking)","upstreamModelId":"gpt-5.6-luna","isDefault":false,"contextLength":272000},
  {"id":"claude-sonnet-5-agentic","name":"Claude Sonnet 5 (Agentic)","isDefault":false},
  {"id":"claude-sonnet-4.5-agentic","name":"Claude Sonnet 4.5 (Agentic)","isDefault":false},
  {"id":"claude-haiku-4.5-agentic","name":"Claude Haiku 4.5 (Agentic)","isDefault":false},
  {"id":"gpt-5.6-sol-agentic","name":"GPT 5.6 Sol (Agentic)","upstreamModelId":"gpt-5.6-sol","isDefault":false,"contextLength":272000},
  {"id":"gpt-5.6-terra-agentic","name":"GPT 5.6 Terra (Agentic)","upstreamModelId":"gpt-5.6-terra","isDefault":false,"contextLength":272000},
  {"id":"gpt-5.6-luna-agentic","name":"GPT 5.6 Luna (Agentic)","upstreamModelId":"gpt-5.6-luna","isDefault":false,"contextLength":272000},
  {"id":"claude-sonnet-5-thinking-agentic","name":"Claude Sonnet 5 (Thinking + Agentic)","isDefault":false},
  {"id":"claude-sonnet-4.5-thinking-agentic","name":"Claude Sonnet 4.5 (Thinking + Agentic)","isDefault":false},
  {"id":"claude-haiku-4.5-thinking-agentic","name":"Claude Haiku 4.5 (Thinking + Agentic)","isDefault":false},
  {"id":"gpt-5.6-sol-thinking-agentic","name":"GPT 5.6 Sol (Thinking + Agentic)","upstreamModelId":"gpt-5.6-sol","isDefault":false,"contextLength":272000},
  {"id":"gpt-5.6-terra-thinking-agentic","name":"GPT 5.6 Terra (Thinking + Agentic)","upstreamModelId":"gpt-5.6-terra","isDefault":false,"contextLength":272000},
  {"id":"gpt-5.6-luna-thinking-agentic","name":"GPT 5.6 Luna (Thinking + Agentic)","upstreamModelId":"gpt-5.6-luna","isDefault":false,"contextLength":272000},
];
const ANTHROPIC_SNAPSHOT_SUFFIX = /-\d{8}$/;

export function normalizeKiroUpstreamModelId(model?: string): string {
  if (typeof model !== "string" || !model) return model || "";

  const id = model.toLowerCase().replace(ANTHROPIC_SNAPSHOT_SUFFIX, "");

  if (id.includes("sonnet")) {
    if (id.includes("5.5") || id.includes("5-5")) return "claude-sonnet-5.5";
    if (id.includes("4.6") || id.includes("4-6")) return "claude-sonnet-4.6";
    if (id.includes("sonnet-5") || id.includes("sonnet.5")) return "claude-sonnet-5";
    if (id.includes("4.5") || id.includes("4-5")) return "claude-sonnet-4.5";
    if (id.includes("sonnet-4") || id.includes("sonnet.4")) return "claude-sonnet-4";
    return "claude-sonnet-4.5";
  }
  if (id.includes("fable")) return "claude-fable-5";
  if (id.includes("opus")) {
    if (id.includes("5.5") || id.includes("5-5")) return "claude-opus-5.5";
    if (id.includes("opus-5") || id.includes("opus.5") || id.includes("opus 5")) return "claude-opus-5";
    if (id.includes("4.8") || id.includes("4-8")) return "claude-opus-4.8";
    if (id.includes("4.7") || id.includes("4-7")) return "claude-opus-4.7";
    if (id.includes("4.5") || id.includes("4-5")) return "claude-opus-4.5";
    return "claude-opus-4.6";
  }
  if (id.includes("haiku")) {
    return id.includes("5.5") || id.includes("5-5") ? "claude-haiku-5.5" : "claude-haiku-4.5";
  }
  if (id === "auto") return "auto";
  if (id.includes("deepseek")) return "deepseek-3.2";
  if (id.includes("glm")) return "glm-5";
  if (id.includes("minimax")) {
    return id.includes("2.5") || id.includes("2-5") ? "minimax-m2.5" : "minimax-m2.1";
  }
  if (id.includes("qwen")) return "qwen3-coder-next";
  if (id.includes("kimi")) return "kimi-k3";
  if (id.includes("gpt")) {
    if (id.includes("terra")) return "gpt-5.6-terra";
    if (id.includes("luna")) return "gpt-5.6-luna";
    if (id.includes("sol") || id.includes("5.6") || id.includes("5-6")) return "gpt-5.6-sol";
    return model;
  }
  return model;
}