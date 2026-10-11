import { generateRootCA, loadRootCA, generateLeafCert, type RootCAFiles, type LeafCert } from "./rootCA.js";

export function generateCert(): RootCAFiles {
  return generateRootCA();
}

export function getCertForDomain(domain: string): LeafCert | null {
  try {
    const rootCA = loadRootCA();
    return generateLeafCert(domain, rootCA);
  } catch (error: any) {
    console.error(`[MITM] Failed to generate cert for ${domain}:`, error?.message);
    return null;
  }
}
