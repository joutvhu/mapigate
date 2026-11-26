/**
 * Isomorphic Stainless SDK environment header resolvers for Anthropic Claude.
 * Matches `@anthropic-ai/sdk` platform/architecture mapping while staying
 * browser-safe and falling back to realistic defaults instead of exposing exotic host strings.
 */

export function resolveStainlessOs(): string {
  if (typeof process === "undefined" || !process.platform) return "MacOS";
  const p = process.platform.toLowerCase();
  if (p.includes("ios")) return "iOS";
  if (p === "android") return "Android";
  if (p === "darwin") return "MacOS";
  if (p === "win32") return "Windows";
  if (p === "freebsd") return "FreeBSD";
  if (p === "openbsd") return "OpenBSD";
  if (p === "linux") return "Linux";
  return "MacOS";
}

export function resolveStainlessArch(): string {
  if (typeof process === "undefined" || !process.arch) return "arm64";
  const a: string = process.arch;
  if (a === "ia32" || a === "x32") return "x32";
  if (a === "x86_64" || a === "x64") return "x64";
  if (a === "arm") return "arm";
  if (a === "aarch64" || a === "arm64") return "arm64";
  return resolveStainlessOs() === "MacOS" ? "arm64" : "x64";
}
