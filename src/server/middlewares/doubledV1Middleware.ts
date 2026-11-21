import type { Request, Response, NextFunction } from "express";

// `/v1/v1`, `/v1/v1/...` or `/v1/v1?...` (repeats allowed: `/v1/v1/v1/...`).
// Anchored to whole segments so `/v1/v1beta` or `/v1/v1x` are left alone.
const DOUBLED_V1 = /^(?:\/v1)+(?=\/v1(?:[/?]|$))/;

/**
 * Collapse a duplicated `/v1` prefix to a single one.
 *
 * Anthropic-style clients (Claude Desktop custom provider, Claude Code,
 * Anthropic SDK) treat the configured base URL as an origin and append
 * `/v1/models`, `/v1/messages` themselves. When a user pastes an OpenAI-style
 * base URL ending in `/v1`, requests land on `/v1/v1/...` and return 404.
 * Collapsing the duplicated prefix transparently routes them to `/v1/...`.
 */
export function collapseDoubledV1Prefix(req: Request, _res: Response, next: NextFunction): void {
  if (req.url.startsWith("/v1/v1")) {
    req.url = req.url.replace(DOUBLED_V1, "");
  }
  next();
}
