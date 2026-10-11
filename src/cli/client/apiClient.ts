import { DEFAULT_PORT, DEFAULT_HOST } from "../../shared/constants/index.js";

export interface ApiClientConfig {
  host?: string;
  port?: number;
  protocol?: string;
  timeoutMs?: number;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  statusCode?: number;
}

export class ApiClient {
  private static host: string = (DEFAULT_HOST as string) === "0.0.0.0" ? "127.0.0.1" : DEFAULT_HOST;
  private static port: number = DEFAULT_PORT;
  private static protocol: string = "http";
  private static timeoutMs: number = 5000;

  public static configure(config: ApiClientConfig): void {
    if (config.host) {
      this.host = config.host === "0.0.0.0" ? "127.0.0.1" : config.host;
    }
    if (config.port) {
      this.port = config.port;
    }
    if (config.protocol) {
      this.protocol = config.protocol.replace(/:$/, "");
    }
    if (config.timeoutMs) {
      this.timeoutMs = config.timeoutMs;
    }
  }

  public static getBaseUrl(): string {
    return `${this.protocol}://${this.host}:${this.port}`;
  }

  public static getV1Url(): string {
    return `${this.getBaseUrl()}/v1`;
  }

  public static getPort(): number {
    return this.port;
  }

  public static getHost(): string {
    return this.host;
  }

  private static async request<T = any>(
    path: string,
    options: {
      method?: string;
      body?: any;
      timeoutMs?: number;
    } = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.getBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs || this.timeoutMs);

    try {
      const fetchOptions: RequestInit = {
        method: options.method || "GET",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        signal: controller.signal,
      };

      if (options.body && options.method && options.method !== "GET" && options.method !== "HEAD") {
        fetchOptions.body = JSON.stringify(options.body);
      }

      const res = await fetch(url, fetchOptions);
      clearTimeout(timeout);

      const contentType = res.headers.get("content-type") || "";
      let data: any = null;
      if (contentType.includes("application/json")) {
        data = await res.json();
      } else {
        data = await res.text();
      }

      if (!res.ok) {
        const errorMsg = (typeof data === "object" && data?.error) || res.statusText || `HTTP ${res.status}`;
        return {
          success: false,
          error: errorMsg,
          statusCode: res.status,
          data,
        };
      }

      return {
        success: true,
        data: data as T,
        statusCode: res.status,
      };
    } catch (err: any) {
      clearTimeout(timeout);
      return {
        success: false,
        error: err.name === "AbortError" ? "Request timed out" : err.message || "Network request failed",
      };
    }
  }

  public static async isHealthy(): Promise<boolean> {
    const res = await this.request<{ status: string }>("/health", { timeoutMs: 2000 });
    return res.success && res.data?.status === "ok";
  }

  public static async getStats(): Promise<ApiResponse<any>> {
    return this.request("/api/stats");
  }

  public static async getProviders(): Promise<ApiResponse<any[]>> {
    return this.request("/api/providers");
  }

  public static async getProvider(id: string): Promise<ApiResponse<any>> {
    return this.request(`/api/providers/${encodeURIComponent(id)}`);
  }

  public static async testProvider(id: string): Promise<ApiResponse<any>> {
    return this.request(`/api/providers/${encodeURIComponent(id)}/test`, { method: "POST" });
  }

  public static async toggleAccount(providerId: string, accountId: string, isActive: boolean): Promise<ApiResponse<any>> {
    return this.request(`/api/providers/${encodeURIComponent(providerId)}/accounts/${encodeURIComponent(accountId)}/toggle`, {
      method: "PUT",
      body: { isActive },
    });
  }

  public static async deleteAccount(providerId: string, accountId: string): Promise<ApiResponse<any>> {
    return this.request(`/api/providers/${encodeURIComponent(providerId)}/accounts/${encodeURIComponent(accountId)}`, {
      method: "DELETE",
    });
  }

  public static async addAccount(
    providerId: string,
    account: { name: string; apiKey?: string; providerSpecificData?: any }
  ): Promise<ApiResponse<any>> {
    return this.request(`/api/providers/${encodeURIComponent(providerId)}/accounts`, {
      method: "POST",
      body: account,
    });
  }

  public static async getModels(): Promise<ApiResponse<any[]>> {
    return this.request("/api/models");
  }

  public static async getCombos(): Promise<ApiResponse<any[]>> {
    return this.request("/api/combos");
  }

  public static async createCombo(combo: { name: string; models: string[]; strategy?: string }): Promise<ApiResponse<any>> {
    return this.request("/api/combos", {
      method: "POST",
      body: combo,
    });
  }

  public static async toggleCombo(id: string): Promise<ApiResponse<any>> {
    return this.request(`/api/combos/${encodeURIComponent(id)}/toggle`, { method: "PUT" });
  }

  public static async deleteCombo(id: string): Promise<ApiResponse<any>> {
    return this.request(`/api/combos/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  public static async getApiKeys(): Promise<ApiResponse<any[]>> {
    return this.request("/api/settings/endpoint/keys");
  }

  public static async createApiKey(name?: string): Promise<ApiResponse<any>> {
    return this.request("/api/settings/endpoint/keys", {
      method: "POST",
      body: { name },
    });
  }

  public static async toggleApiKey(id: string): Promise<ApiResponse<any>> {
    return this.request(`/api/settings/endpoint/keys/${encodeURIComponent(id)}/toggle`, { method: "PATCH" });
  }

  public static async deleteApiKey(id: string): Promise<ApiResponse<any>> {
    return this.request(`/api/settings/endpoint/keys/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  public static async getCliToolsStatus(): Promise<ApiResponse<Record<string, any>>> {
    return this.request("/api/cli-tools/status");
  }

  public static async applyCliTool(toolId: string, data?: { model?: string }): Promise<ApiResponse<any>> {
    return this.request(`/api/cli-tools/${encodeURIComponent(toolId)}/apply`, {
      method: "POST",
      body: data || {},
    });
  }

  public static async resetCliTool(toolId: string): Promise<ApiResponse<any>> {
    return this.request(`/api/cli-tools/${encodeURIComponent(toolId)}/reset`, {
      method: "POST",
    });
  }

  public static async getConsoleLogs(): Promise<ApiResponse<any>> {
    return this.request("/api/console-logs");
  }

  public static async getSettings(): Promise<ApiResponse<any>> {
    return this.request("/api/settings");
  }
}
