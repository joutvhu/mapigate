/**
 * Backward-compatible facade for Request Proxy Gateway
 * Re-exports canonical handleProxyRequest, extractHeader, mergeAnthropicBeta,
 * and related types from the modular server proxy pipeline under src/server/proxy/.
 */

export * from "./index.js";
export { handleProxyRequest as default } from "./index.js";
