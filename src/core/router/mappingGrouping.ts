/**
 * Infers a display group name for a model mapping alias when no explicit group is set.
 */
export function inferMappingGroupName(sourceModel: string): string {
  const s = (sourceModel || "").trim().toLowerCase();
  if (!s) return "General";
  if (s === "auto" || s === "default" || s.includes("simple-task") || s.includes("permission")) {
    return "Agent";
  }
  if (s.startsWith("free-")) return "Free";
  if (s.includes("claude") || s === "sonnet" || s === "opus" || s === "haiku" || s === "fable") {
    return "Claude";
  }
  if (s.includes("gemini")) return "Gemini";
  if (s.startsWith("gpt-") || s.startsWith("o1") || s.startsWith("o3") || s.startsWith("o4") || s.includes("codex")) {
    return "GPT / Codex";
  }
  if (s.includes("deepseek")) return "DeepSeek";
  if (s.includes("kimi") || s.includes("glm") || s.includes("mimo") || s.includes("qwen")) {
    return "Open & Asian Models";
  }
  return "General";
}
