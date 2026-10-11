import type { IMitmHandler } from "./types.js";

export class MitmHandlerRegistry {
  private static handlers: Map<string, IMitmHandler> = new Map();

  public static register(handler: IMitmHandler): void {
    this.handlers.set(handler.id.toLowerCase(), handler);
  }

  public static unregister(id: string): void {
    this.handlers.delete(id.toLowerCase());
  }

  public static get(id: string): IMitmHandler | undefined {
    return this.handlers.get(id.toLowerCase());
  }

  public static findHandler(hostname: string, url: string): IMitmHandler | undefined {
    for (const handler of this.handlers.values()) {
      if (handler.canHandle(hostname, url)) {
        return handler;
      }
    }
    return undefined;
  }

  public static getAll(): IMitmHandler[] {
    return Array.from(this.handlers.values());
  }

  public static clear(): void {
    this.handlers.clear();
  }
}
