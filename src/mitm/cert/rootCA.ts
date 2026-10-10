import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import forge from "node-forge";
import { MITM_DIR, getMitmDir } from "../paths.js";

export const ROOT_CA_KEY_PATH = path.join(MITM_DIR, "rootCA.key");
export const ROOT_CA_CERT_PATH = path.join(MITM_DIR, "rootCA.crt");
export const ROOT_CA_CN = "Routen MITM Root CA";

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
    { name: "organizationName", value: "Routen" },
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

  fs.writeFileSync(ROOT_CA_KEY_PATH, privateKeyPem, "utf8");
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

export function generateLeafCert(domain: string, rootCA: LoadedRootCA): LeafCert {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();

  cert.publicKey = keys.publicKey;
  cert.serialNumber = Math.floor(Math.random() * 10000000).toString();
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);

  cert.setSubject([{ name: "commonName", value: domain }]);
  cert.setIssuer(rootCA.cert.subject.attributes);

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
      altNames: [
        { type: 2, value: domain },
        { type: 2, value: `*.${domain}` },
      ],
    },
  ]);

  cert.sign(rootCA.key, forge.md.sha256.create());

  return {
    key: forge.pki.privateKeyToPem(keys.privateKey),
    cert: forge.pki.certificateToPem(cert),
  };
}
