import { OpenAiCompatibleProvider } from "../../core/base/openAiProvider.js";
import type { ProviderProbeContext, ProviderProbeResult } from "../../core/types.js";
import { metadata } from "./metadata.js";
import crypto from "node:crypto";

export class CommandcodeProvider extends OpenAiCompatibleProvider {
  public override readonly id = metadata.id;
  public override readonly name = metadata.name;
  public override readonly defaultFormat = metadata.format || "openai";

  public override async probeModels(context: ProviderProbeContext): Promise<ProviderProbeResult | null> {
    const token = (context.apiKey || context.account?.rawApiKey || "").trim();
    if (!token) {
      return {
        success: false,
        error: "Command Code API key is required (starts with user_...)",
      };
    }

    const timeoutMs = context.timeoutMs || 8000;
    const url = "https://api.commandcode.ai/alpha/generate";

    const body = {
      threadId: crypto.randomUUID(),
      memory: "",
      config: {
        workingDir: process.cwd(),
        date: new Date().toISOString().slice(0, 10),
        environment: process.platform,
        structure: [],
        isGitRepo: false,
        currentBranch: "",
        mainBranch: "",
        gitStatus: "",
        recentCommits: [],
      },
      params: {
        model: "claude-3-5-sonnet-20241022",
        messages: [{ role: "user", content: [{ type: "text", text: "ping" }] }],
        stream: true,
        max_tokens: 1,
      },
    };

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: token.startsWith("Bearer ") ? token : `Bearer ${token}`,
          "User-Agent": "cli",
          "x-session-id": crypto.randomUUID(),
          "x-command-code-version": "1.88.0",
          "x-cli-environment": "production",
          "x-cli-surface": "cli",
          "x-taste-learning": "false",
          Accept: "text/event-stream",
          ...(context.customHeaders || {}),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (res.ok || res.status === 200) {
        return {
          success: true,
          endpointUrl: url,
          models: metadata.models.map((m) => ({ id: m.id, name: m.name, contextLength: m.contextLength })),
          count: metadata.models.length,
        };
      }

      const errText = await res.text().catch(() => "");
      try {
        const errJson: any = JSON.parse(errText);
        const errMsg = errJson?.error?.message || errJson?.message || "";
        if (errMsg.toLowerCase().includes("insufficient credits")) {
          return {
            success: true,
            endpointUrl: url,
            models: metadata.models.map((m) => ({ id: m.id, name: m.name, contextLength: m.contextLength })),
            count: metadata.models.length,
          };
        }
        if (res.status === 401 || res.status === 403) {
          return {
            success: false,
            error: `Authentication failed (HTTP ${res.status}): ${errMsg || "Invalid Command Code API key"}`,
            authError: errMsg || "Invalid API key",
          };
        }
        return {
          success: false,
          error: `Endpoint ${url} returned HTTP ${res.status}: ${errMsg || errText}`,
        };
      } catch {
        return {
          success: false,
          error: `Endpoint ${url} returned HTTP ${res.status}: ${errText.slice(0, 100)}`,
        };
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: `Failed to connect to Command Code: ${msg}`,
      };
    }
  }
}

export default CommandcodeProvider;
