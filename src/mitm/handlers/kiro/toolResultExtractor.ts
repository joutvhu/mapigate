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

const UNCHANGED_FILE_REGEX = /['"`]?([^'"`\r\n]+)['"`]?\s+is unchanged since you read it earlier this session/i;
const UNCHANGED_FALLBACK_NOTE =
  "\n\n[System Note: The full content of this file was already loaded in the conversation history above. You must use that existing content and proceed directly with your plan/implementation. Do not call read_file again for this file.]";

function normalizeFilePath(filePath: string): string {
  return filePath.replace(/\\/g, "/").toLowerCase().trim();
}

function getBaseFileName(filePath: string): string {
  const norm = filePath.replace(/\\/g, "/").trim();
  const lastSlash = norm.lastIndexOf("/");
  return (lastSlash >= 0 ? norm.slice(lastSlash + 1) : norm).toLowerCase();
}

/**
 * Recovers unchanged file content from conversation history when Kiro returns
 * "'<path>' is unchanged since you read it earlier this session".
 * If previous content is found in priorHistory, returns the actual file content.
 * Otherwise, appends a concise system note to break repetitive loops.
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
          targetPath = matchingTu.input?.path || matchingTu.input?.filePath || matchingTu.input?.file_path || "";
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

  // 2. Search backwards in priorHistory for a previous successful read_file result for this file
  if (targetPath && priorHistory.length > 0) {
    const normTarget = normalizeFilePath(targetPath);
    const baseTarget = getBaseFileName(targetPath);

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
                const p = tu.input?.path || tu.input?.filePath || tu.input?.file_path;
                if (typeof p === "string") {
                  const np = normalizeFilePath(p);
                  const bp = getBaseFileName(p);
                  if (np === normTarget || (baseTarget && bp === baseTarget)) {
                    isMatch = true;
                  }
                }
                break;
              }
            }
          }
        }

        if (!isMatch && (candidateText.includes(targetPath) || (baseTarget && candidateText.includes(baseTarget)))) {
          isMatch = true;
        }

        if (isMatch) {
          return candidateText;
        }
      }
    }
  }

  // 3. Fallback when not found in prior history
  return rawContent + UNCHANGED_FALLBACK_NOTE;
}
