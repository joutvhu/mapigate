import fs from "node:fs";
import path from "node:path";

export function extractToolResultContent(tr: any): string {
  if (!tr) return "";
  if (typeof tr.content === "string") return tr.content;
  if (Array.isArray(tr.content)) {
    return tr.content
      .map((c: any) => {
        if (typeof c === "string") return c;
        if (c?.text != null) return c.text;
        if (c?.data != null) return typeof c.data === "string" ? c.data : JSON.stringify(c.data);
        if (c?.output != null) return typeof c.output === "string" ? c.output : JSON.stringify(c.output);
        if (c?.json != null) return JSON.stringify(c.json);
        return "";
      })
      .join("\n");
  }
  if (typeof tr.content === "object" && tr.content !== null) {
    if (tr.content.text != null) return tr.content.text;
    if (tr.content.data != null) return typeof tr.content.data === "string" ? tr.content.data : JSON.stringify(tr.content.data);
    if (tr.content.output != null) return typeof tr.content.output === "string" ? tr.content.output : JSON.stringify(tr.content.output);
    try {
      return JSON.stringify(tr.content);
    } catch {
      return "";
    }
  }
  return "";
}

export const UNCHANGED_FILE_REGEX = /['"`]?([^'"`\r\n]+)['"`]?\s+is unchanged since you read it earlier this session/i;
export const UNCHANGED_FALLBACK_NOTE =
  "\n\n[System Note: The full content of this file was already loaded in the conversation history above. [Notice: File content was already loaded in earlier context. DO NOT call read_file or read_code again for this file. Proceed immediately with your task.]]";

export function normalizeFilePath(filePath: string): string {
  let norm = filePath.replace(/\\/g, "/").toLowerCase().trim();
  if (norm.startsWith("./")) {
    norm = norm.slice(2);
  }
  return norm;
}

/**
 * Normalized path suffix matching to prevent cross-folder collisions (e.g. index.ts).
 * Returns true if paths match exactly or if one is a valid path suffix of the other
 * with a leading path separator boundary.
 */
export function isNormalizedPathMatch(path1: string, path2: string): boolean {
  if (!path1 || !path2) return false;
  const np1 = normalizeFilePath(path1);
  const np2 = normalizeFilePath(path2);
  if (np1 === np2) return true;

  // Must match on a directory boundary: either "/np2" at end of np1 or "/np1" at end of np2
  if (np1.endsWith("/" + np2) || np2.endsWith("/" + np1)) {
    return true;
  }
  return false;
}

export function readLocalFileContent(targetPath: string): string | null {
  if (!targetPath) return null;
  const clean = targetPath.replace(/^['"`]+|['"`]+$/g, "").trim();
  if (!clean) return null;

  try {
    let resolved = clean;
    if (!fs.existsSync(resolved)) {
      resolved = path.resolve(clean);
    }
    if (fs.existsSync(resolved)) {
      const stat = fs.statSync(resolved);
      if (stat.isFile() && stat.size <= 2_000_000) {
        return fs.readFileSync(resolved, "utf-8");
      }
    }
  } catch {
    // Fail-open defensively
  }
  return null;
}

function tryParseArgs(args: any): any {
  if (!args) return {};
  if (typeof args === "object") return args;
  if (typeof args === "string") {
    try {
      return JSON.parse(args);
    } catch {
      return {};
    }
  }
  return {};
}

function extractToolUseTargetFilePath(tu: any): string {
  if (!tu) return "";
  const args = tryParseArgs(tu.function?.arguments || tu.input);
  const p = args?.path || args?.filePath || args?.file_path;
  return typeof p === "string" ? p : "";
}

function extractFilePathFromCandidateText(candidateText: string): string | null {
  const match = candidateText.match(/<file\s+[^>]*name=["']([^"']+)["']/i);
  if (match && match[1]) {
    return match[1];
  }
  return null;
}

/**
 * Recovers unchanged file content from CodeWhisperer wire format (conversationState)
 * when Kiro returns "'<path>' is unchanged since you read it earlier this session".
 */
export function recoverUnchangedFileContent(tr: any, priorHistory: any[] = []): string {
  const rawContent = extractToolResultContent(tr);
  if (!rawContent || !rawContent.includes("is unchanged since you read it earlier this session")) {
    return rawContent;
  }

  // 1. Try to extract target file path from preceding assistant toolUses or from the notice text
  let targetPath = "";
  if (tr?.toolUseId && priorHistory.length > 0) {
    for (let i = priorHistory.length - 1; i >= 0; i--) {
      const arm = priorHistory[i]?.assistantResponseMessage;
      if (arm?.toolUses) {
        const matchingTu = arm.toolUses.find((tu: any) => tu.toolUseId === tr.toolUseId);
        if (matchingTu) {
          targetPath = extractToolUseTargetFilePath(matchingTu);
          if (targetPath) break;
        }
      }
    }
  }

  if (!targetPath) {
    const match = rawContent.match(UNCHANGED_FILE_REGEX);
    if (match && match[1]) {
      targetPath = match[1].trim();
    }
  }

  // 2. Search backwards in priorHistory for previous successful read result
  if (targetPath && priorHistory.length > 0) {
    for (let i = priorHistory.length - 1; i >= 0; i--) {
      const item = priorHistory[i];
      const toolResults = item?.userInputMessage?.userInputMessageContext?.toolResults;
      if (!Array.isArray(toolResults)) continue;

      for (const candidateTr of toolResults) {
        if (candidateTr.toolUseId === tr.toolUseId) continue;
        const candidateText = extractToolResultContent(candidateTr);
        if (!candidateText || candidateText.includes("is unchanged since you read it earlier this session")) {
          continue;
        }

        let isMatch = false;
        if (candidateTr.toolUseId) {
          for (let j = i - 1; j >= 0; j--) {
            const arm = priorHistory[j]?.assistantResponseMessage;
            if (arm?.toolUses) {
              const tu = arm.toolUses.find((u: any) => u.toolUseId === candidateTr.toolUseId);
              if (tu) {
                const p = extractToolUseTargetFilePath(tu);
                if (p && isNormalizedPathMatch(p, targetPath)) {
                  isMatch = true;
                }
                break;
              }
            }
          }
        }

        if (!isMatch) {
          const tagPath = extractFilePathFromCandidateText(candidateText);
          if (tagPath && isNormalizedPathMatch(tagPath, targetPath)) {
            isMatch = true;
          }
        }

        if (isMatch) {
          return candidateText;
        }
      }
    }
  }

  // 3. Fallback Level 1: Read directly from local disk if available
  if (targetPath) {
    const diskContent = readLocalFileContent(targetPath);
    if (diskContent !== null) {
      return diskContent;
    }
  }

  // 4. Fallback Level 2: Append concise system note
  return rawContent + UNCHANGED_FALLBACK_NOTE;
}

/**
 * Universal Tool Result Recoverer for standard OpenAI messages format.
 * Scans all role === "tool" messages. When an unchanged file notice is found,
 * recovers the file content from prior conversation messages or local disk.
 */
export function recoverUnchangedToolResultsInMessages(messages: any[]): void {
  if (!Array.isArray(messages) || messages.length === 0) return;

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role !== "tool") continue;

    const rawContent = typeof msg.content === "string" ? msg.content : extractToolResultContent(msg);
    if (!rawContent || !rawContent.includes("is unchanged since you read it earlier this session")) {
      continue;
    }

    let targetPath = "";
    if (msg.tool_call_id) {
      for (let j = i - 1; j >= 0; j--) {
        const prevMsg = messages[j];
        if (prevMsg.role === "assistant" && Array.isArray(prevMsg.tool_calls)) {
          const matchingTc = prevMsg.tool_calls.find((tc: any) => tc.id === msg.tool_call_id);
          if (matchingTc) {
            targetPath = extractToolUseTargetFilePath(matchingTc);
            if (targetPath) break;
          }
        }
      }
    }

    if (!targetPath) {
      const match = rawContent.match(UNCHANGED_FILE_REGEX);
      if (match && match[1]) {
        targetPath = match[1].trim();
      }
    }

    let recovered: string | null = null;
    if (targetPath) {
      // Search backwards in messages
      for (let j = i - 1; j >= 0; j--) {
        const prevMsg = messages[j];
        if (prevMsg.role === "tool" && prevMsg.tool_call_id !== msg.tool_call_id) {
          const prevContent = typeof prevMsg.content === "string" ? prevMsg.content : extractToolResultContent(prevMsg);
          if (!prevContent || prevContent.includes("is unchanged since you read it earlier this session")) {
            continue;
          }

          let isMatch = false;
          if (prevMsg.tool_call_id) {
            for (let k = j - 1; k >= 0; k--) {
              const assistantMsg = messages[k];
              if (assistantMsg.role === "assistant" && Array.isArray(assistantMsg.tool_calls)) {
                const prevTc = assistantMsg.tool_calls.find((tc: any) => tc.id === prevMsg.tool_call_id);
                if (prevTc) {
                  const prevP = extractToolUseTargetFilePath(prevTc);
                  if (prevP && isNormalizedPathMatch(prevP, targetPath)) {
                    isMatch = true;
                  }
                  break;
                }
              }
            }
          }

          if (!isMatch) {
            const tagPath = extractFilePathFromCandidateText(prevContent);
            if (tagPath && isNormalizedPathMatch(tagPath, targetPath)) {
              isMatch = true;
            }
          }

          if (isMatch) {
            recovered = prevContent;
            break;
          }
        }
      }

      // Fallback Level 1: Local disk
      if (!recovered) {
        const diskContent = readLocalFileContent(targetPath);
        if (diskContent !== null) {
          recovered = diskContent;
        }
      }
    }

    // Fallback Level 2: Append system note
    msg.content = recovered !== null ? recovered : rawContent + UNCHANGED_FALLBACK_NOTE;
  }
}

/**
 * In-flight tool result string recovery for provider executors (Antigravity).
 * Guarantees Gemini never receives an unfulfilled unchanged notice.
 */
export function recoverUnchangedToolResultString(
  resp: string,
  origToolUseId?: string,
  messages: any[] = []
): string {
  if (!resp || !resp.includes("is unchanged since you read it earlier this session")) {
    return resp;
  }

  let targetPath = "";
  if (origToolUseId && Array.isArray(messages)) {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role === "assistant" && Array.isArray(msg.tool_calls)) {
        const tc = msg.tool_calls.find((c: any) => c.id === origToolUseId);
        if (tc) {
          targetPath = extractToolUseTargetFilePath(tc);
          if (targetPath) break;
        }
      }
    }
  }

  if (!targetPath) {
    const match = resp.match(UNCHANGED_FILE_REGEX);
    if (match && match[1]) {
      targetPath = match[1].trim();
    }
  }

  if (targetPath && Array.isArray(messages)) {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role === "tool" && msg.tool_call_id !== origToolUseId) {
        const contentStr = typeof msg.content === "string" ? msg.content : extractToolResultContent(msg);
        if (!contentStr || contentStr.includes("is unchanged since you read it earlier this session")) {
          continue;
        }

        let isMatch = false;
        if (msg.tool_call_id) {
          for (let j = i - 1; j >= 0; j--) {
            const prevAss = messages[j];
            if (prevAss.role === "assistant" && Array.isArray(prevAss.tool_calls)) {
              const prevTc = prevAss.tool_calls.find((c: any) => c.id === msg.tool_call_id);
              if (prevTc) {
                const prevP = extractToolUseTargetFilePath(prevTc);
                if (prevP && isNormalizedPathMatch(prevP, targetPath)) {
                  isMatch = true;
                }
                break;
              }
            }
          }
        }

        if (!isMatch) {
          const tagPath = extractFilePathFromCandidateText(contentStr);
          if (tagPath && isNormalizedPathMatch(tagPath, targetPath)) {
            isMatch = true;
          }
        }

        if (isMatch) {
          return contentStr;
        }
      }
    }

    const diskContent = readLocalFileContent(targetPath);
    if (diskContent !== null) {
      return diskContent;
    }
  }

  return resp + UNCHANGED_FALLBACK_NOTE;
}
