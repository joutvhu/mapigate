import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import net from "node:net";
import forge from "node-forge";
import { MITM_DIR, getMitmDir } from "../paths.js";

export const ROOT_CA_KEY_PATH = path.join(MITM_DIR, "rootCA.key");
export const ROOT_CA_CERT_PATH = path.join(MITM_DIR, "rootCA.crt");
export const ROOT_CA_CN = "Mapigate MITM Root CA";

export interface RootCAFiles {
  key: string;
  cert: string;
}

export interface LoadedRootCA {
  key: forge.pki.rsa.PrivateKey;
  cert: forge.pki.Certificate;
}

export interface LeafCert {
  key: string;
  cert: string;
}

export function isCertExpired(certPath: string): boolean {
  try {
    const pem = fs.readFileSync(certPath, "utf8");
    const cert = forge.pki.certificateFromPem(pem);
    const expiryThreshold = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    return cert.validity.notAfter < expiryThreshold;
  } catch {
    return true;
  }
}

export function getCertFingerprint(certPath: string): string {
  try {
    const pem = fs.readFileSync(certPath, "utf-8");
    const der = Buffer.from(
      pem.replace(/-----[^-]+-----/g, "").replace(/\s/g, ""),
      "base64"
    );
    const hex = crypto.createHash("sha1").update(der).digest("hex").toUpperCase();
    return hex.match(/.{2}/g)?.join(":") || hex;
  } catch {
    return "";
  }
}

export function generateRootCA(): RootCAFiles {
  getMitmDir();
  const exists = fs.existsSync(ROOT_CA_KEY_PATH) && fs.existsSync(ROOT_CA_CERT_PATH);
  if (exists && !isCertExpired(ROOT_CA_CERT_PATH)) {
    return { key: ROOT_CA_KEY_PATH, cert: ROOT_CA_CERT_PATH };
  }

  if (exists) {
    try { fs.unlinkSync(ROOT_CA_KEY_PATH); } catch {}
    try { fs.unlinkSync(ROOT_CA_CERT_PATH); } catch {}
  }

  // Generate RSA 2048 key pair
  const keys = forge.pki.rsa.generateKeyPair(2048);

  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 10);

  const attrs = [
    { name: "commonName", value: ROOT_CA_CN },
    { name: "organizationName", value: "Mapigate" },
    { name: "countryName", value: "US" },
  ];

  cert.setSubject(attrs);
  cert.setIssuer(attrs);

  cert.setExtensions([
    {
      name: "basicConstraints",
      cA: true,
      critical: true,
    },
    {
      name: "keyUsage",
      keyCertSign: true,
      cRLSign: true,
      critical: true,
    },
    {
      name: "subjectKeyIdentifier",
    },
  ]);

  cert.sign(keys.privateKey, forge.md.sha256.create());

  const privateKeyPem = forge.pki.privateKeyToPem(keys.privateKey);
  const certPem = forge.pki.certificateToPem(cert);

  fs.writeFileSync(ROOT_CA_KEY_PATH, privateKeyPem, { encoding: "utf8", mode: 0o600 });
  try {
    fs.chmodSync(ROOT_CA_KEY_PATH, 0o600);
  } catch {}
  fs.writeFileSync(ROOT_CA_CERT_PATH, certPem, "utf8");

  return { key: ROOT_CA_KEY_PATH, cert: ROOT_CA_CERT_PATH };
}

export function loadRootCA(): LoadedRootCA {
  if (!fs.existsSync(ROOT_CA_KEY_PATH) || !fs.existsSync(ROOT_CA_CERT_PATH)) {
    generateRootCA();
  }

  const keyPem = fs.readFileSync(ROOT_CA_KEY_PATH, "utf8");
  const certPem = fs.readFileSync(ROOT_CA_CERT_PATH, "utf8");

  return {
    key: forge.pki.privateKeyFromPem(keyPem) as forge.pki.rsa.PrivateKey,
    cert: forge.pki.certificateFromPem(certPem),
  };
}

let sharedLeafKeyPair: forge.pki.rsa.KeyPair | null = null;
let sharedLeafPrivateKeyPem: string | null = null;

function getSharedLeafKeyPair(): { keys: forge.pki.rsa.KeyPair; privateKeyPem: string } {
  if (!sharedLeafKeyPair || !sharedLeafPrivateKeyPem) {
    sharedLeafKeyPair = forge.pki.rsa.generateKeyPair(2048);
    sharedLeafPrivateKeyPem = forge.pki.privateKeyToPem(sharedLeafKeyPair.privateKey);
  }
  return { keys: sharedLeafKeyPair, privateKeyPem: sharedLeafPrivateKeyPem };
}

export function generateLeafCert(domain: string, rootCA: LoadedRootCA): LeafCert {
  const { keys, privateKeyPem } = getSharedLeafKeyPair();
  const cert = forge.pki.createCertificate();

  cert.publicKey = keys.publicKey;
  const serialBytes = crypto.randomBytes(16);
  serialBytes[0] &= 0x7f;
  serialBytes[0] |= 0x01;
  cert.serialNumber = serialBytes.toString("hex");
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);

  const cleanDomain = domain.trim().replace(/^\[|\]$/g, "");
  const cn = cleanDomain.length > 64 ? cleanDomain.slice(-64) : cleanDomain;
  cert.setSubject([{ name: "commonName", value: cn }]);
  cert.setIssuer(rootCA.cert.subject.attributes);

  const isIp = net.isIP(cleanDomain) !== 0;
  const altNames = isIp
    ? [{ type: 7, ip: cleanDomain }]
    : [
        { type: 2, value: cleanDomain },
        { type: 2, value: `*.${cleanDomain}` },
      ];

  cert.setExtensions([
    {
      name: "basicConstraints",
      cA: false,
    },
    {
      name: "keyUsage",
      digitalSignature: true,
      keyEncipherment: true,
    },
    {
      name: "extKeyUsage",
      serverAuth: true,
      clientAuth: true,
    },
    {
      name: "subjectAltName",
      altNames,
    },
  ]);

  cert.sign(rootCA.key, forge.md.sha256.create());

  return {
    key: privateKeyPem,
    cert: forge.pki.certificateToPem(cert),
  };
}
