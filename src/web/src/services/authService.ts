export interface AuthStatus {
  enabled: boolean;
  authenticated: boolean;
}

export const TOKEN_KEY = "mapigate_auth_token";

let interceptorInstalled = false;
type AuthLockListener = () => void;
const lockListeners: Set<AuthLockListener> = new Set();

export function onAuthLock(listener: AuthLockListener): () => void {
  lockListeners.add(listener);
  return () => {
    lockListeners.delete(listener);
  };
}

export function triggerAuthLock(): void {
  for (const listener of lockListeners) {
    try {
      listener();
    } catch {}
  }
}

export class AuthService {
  public static getToken(): string | null {
    if (typeof window === "undefined") return null;
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  }

  public static setToken(token: string): void {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {}
  }

  public static removeToken(): void {
    if (typeof window === "undefined") return;
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {}
  }

  public static async checkStatus(): Promise<AuthStatus> {
    try {
      const token = this.getToken();
      const headers: Record<string, string> = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      const res = await fetch("/api/auth/status", { headers });
      if (!res.ok) {
        return { enabled: false, authenticated: true };
      }
      const data = await res.json();
      return {
        enabled: Boolean(data.enabled),
        authenticated: Boolean(data.authenticated),
      };
    } catch {
      return { enabled: false, authenticated: true };
    }
  }

  public static async login(password: string): Promise<{ success: boolean; token?: string; error?: string }> {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (data.token) {
          this.setToken(data.token);
        }
        return { success: true, token: data.token };
      }
      return { success: false, error: data.error || "Invalid master password" };
    } catch (err: any) {
      return { success: false, error: err.message || "Failed to authenticate" };
    }
  }

  public static async logout(): Promise<void> {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {}
    this.removeToken();
    triggerAuthLock();
  }

  public static async setup(password: string): Promise<{ success: boolean; token?: string; error?: string }> {
    try {
      const res = await fetch("/api/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (data.token) {
          this.setToken(data.token);
        }
        return { success: true, token: data.token };
      }
      return { success: false, error: data.error || "Failed to setup master password" };
    } catch (err: any) {
      return { success: false, error: err.message || "Failed to setup master password" };
    }
  }

  public static async changePassword(
    currentPassword: string,
    newPassword: string
  ): Promise<{ success: boolean; token?: string; error?: string }> {
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (data.token) {
          this.setToken(data.token);
        }
        return { success: true, token: data.token };
      }
      return { success: false, error: data.error || "Failed to change master password" };
    } catch (err: any) {
      return { success: false, error: err.message || "Failed to change master password" };
    }
  }

  public static async removePassword(currentPassword: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch("/api/auth/remove-password", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        this.removeToken();
        return { success: true };
      }
      return { success: false, error: data.error || "Failed to remove master password" };
    } catch (err: any) {
      return { success: false, error: err.message || "Failed to remove master password" };
    }
  }
}

/**
 * Setup global window.fetch interceptor to automatically add Bearer token to /api/ requests
 * and trigger lock when a 401 AUTH_REQUIRED response is encountered.
 */
export function setupFetchInterceptor(): void {
  if (typeof window === "undefined" || interceptorInstalled) return;
  interceptorInstalled = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    let url = "";
    if (typeof input === "string") {
      url = input;
    } else if (input instanceof URL) {
      url = input.toString();
    } else if (input && typeof (input as Request).url === "string") {
      url = (input as Request).url;
    }

    const isApiRequest = url.startsWith("/api/") || url.includes("/api/");
    const isPublicAuth = url.includes("/api/auth/status") || url.includes("/api/auth/login");

    let modifiedInit = init;
    const token = AuthService.getToken();

    if (isApiRequest && token) {
      const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
      if (!headers.has("Authorization")) {
        headers.set("Authorization", `Bearer ${token}`);
      }
      modifiedInit = {
        ...init,
        headers,
      };
    }

    const response = await originalFetch(input, modifiedInit);

    // If an authenticated endpoint returned 401 with AUTH_REQUIRED, trigger auth lock
    if (isApiRequest && !isPublicAuth && response.status === 401) {
      try {
        const clone = response.clone();
        const data = await clone.json();
        if (data && data.code === "AUTH_REQUIRED") {
          triggerAuthLock();
        }
      } catch {
        // Non-JSON response, ignore
      }
    }

    return response;
  };
}

// Auto-initialize interceptor on module import
setupFetchInterceptor();
