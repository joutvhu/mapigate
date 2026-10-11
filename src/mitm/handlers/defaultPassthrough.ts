import type { IMitmHandler, MitmRequestContext } from "../types.js";
import { passthroughHttps } from "./base.js";

export class DefaultPassthroughMitmHandler implements IMitmHandler {
  public readonly id = "passthrough";

  public canHandle(_hostname: string, _url: string): boolean {
    return true;
  }

  public async handle(context: MitmRequestContext): Promise<void> {
    await passthroughHttps(context.req, context.res, context.bodyBuffer);
  }
}
