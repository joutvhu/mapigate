/**
 * Filter for git diff outputs
 * Trims excessive unchanged context and strips git hash metadata
 */
export function compressGitDiff(text: string): string {
  if (!text.includes("diff --git") && !text.includes("@@ -")) {
    return text;
  }

  const lines = text.split("\n");
  const result: string[] = [];
  let consecutiveContext = 0;

  for (const line of lines) {
    // Strip index/hash lines
    if (line.startsWith("index ") && line.includes("..")) {
      continue;
    }

    // Context line (starts with space)
    if (line.startsWith(" ") && !line.startsWith("+++ ") && !line.startsWith("--- ")) {
      consecutiveContext++;
      if (consecutiveContext <= 3) {
        result.push(line);
      } else if (consecutiveContext === 4) {
        result.push(" ... [context trimmed] ...");
      }
      // Skip context lines beyond 4
    } else {
      consecutiveContext = 0;
      result.push(line);
    }
  }

  return result.join("\n");
}
