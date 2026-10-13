import type { ITokenSaverMethod } from "./types.js";

/**
 * TokenSaverRegistry - Central registry for token saver methods.
 */
export class TokenSaverRegistry {
  private static methods: Map<string, ITokenSaverMethod> = new Map();

  public static register(method: ITokenSaverMethod): void {
    if (!method || !method.id) {
      throw new Error("Token saver method must have a valid id");
    }
    this.methods.set(method.id.toLowerCase(), method);
  }

  public static get(id: string): ITokenSaverMethod | undefined {
    return this.methods.get(id.toLowerCase());
  }

  public static getAll(): ITokenSaverMethod[] {
    return Array.from(this.methods.values());
  }

  public static has(id: string): boolean {
    return this.methods.has(id.toLowerCase());
  }

  public static unregister(id: string): boolean {
    return this.methods.delete(id.toLowerCase());
  }

  public static clear(): void {
    this.methods.clear();
  }
}
