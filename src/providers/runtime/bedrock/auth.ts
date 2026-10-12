import crypto from "node:crypto";

export const AWS_SIGV4 = {
  algorithm: "AWS4-HMAC-SHA256",
  terminator: "aws4_request",
  keyPrefix: "AWS4",
  dateHeader: "x-amz-date",
  securityTokenHeader: "x-amz-security-token",
};

export function escapeUri(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function sha256Hex(payload: string): string {
  return crypto
    .createHash("sha256")
    .update(payload ?? "", "utf8")
    .digest("hex");
}

function hmac(key: crypto.BinaryLike, data: string): Buffer {
  return crypto.createHmac("sha256", key).update(data, "utf8").digest();
}

function formatSigningDate(date: Date): { amzDate: string; dateStamp: string } {
  const amzDate = date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
  return { amzDate, dateStamp: amzDate.slice(0, 8) };
}

function canonicalPath(pathname: string, doubleEncodePath: boolean): string {
  if (!doubleEncodePath) return pathname || "/";
  const segments = (pathname || "/")
    .split("/")
    .map((segment) => escapeUri(segment));
  return segments.join("/") || "/";
}

function canonicalizeHeaders(headers: Record<string, string | undefined | null>): {
  canonicalHeaders: string;
  signedHeaders: string;
} {
  const entries = Object.entries(headers)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([name, value]) => [
      name.toLowerCase(),
      String(value).trim().replace(/\s+/g, " "),
    ])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  return {
    canonicalHeaders: entries
      .map(([name, value]) => `${name}:${value}\n`)
      .join(""),
    signedHeaders: entries.map(([name]) => name).join(";"),
  };
}

export interface AwsSignOptions {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
  region: string;
  service: string;
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
  };
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
  doubleEncodePath?: boolean;
  date?: Date;
}

export function signAwsRequest(opts: AwsSignOptions): Record<string, string> {
  const accessKeyId = opts.credentials?.accessKeyId || opts.accessKeyId || "";
  const secretAccessKey = opts.credentials?.secretAccessKey || opts.secretAccessKey || "";
  const sessionToken = opts.credentials?.sessionToken || opts.sessionToken;

  if (!accessKeyId || !secretAccessKey) {
    throw new Error("AWS SigV4 requires both accessKeyId and secretAccessKey");
  }

  const method = opts.method;
  const url = opts.url;
  const headers = opts.headers || {};
  const body = opts.body || "";
  const region = opts.region;
  const service = opts.service;
  const doubleEncodePath = opts.doubleEncodePath !== false;
  const date = opts.date || new Date();

  const parsed = new URL(url);
  if (parsed.search) {
    throw new Error(
      `AWS SigV4 signing does not support query strings (got ${JSON.stringify(parsed.search)}). ` +
        "Move parameters into request body or add query canonicalisation."
    );
  }

  const { amzDate, dateStamp } = formatSigningDate(date);
  const payloadHash = sha256Hex(body);

  const headersToSign: Record<string, string> = {
    ...headers,
    host: parsed.host,
    [AWS_SIGV4.dateHeader]: amzDate,
    ...(sessionToken ? { [AWS_SIGV4.securityTokenHeader]: sessionToken } : {}),
  };

  const { canonicalHeaders, signedHeaders } = canonicalizeHeaders(headersToSign);

  const canonicalRequest = [
    method.toUpperCase(),
    canonicalPath(parsed.pathname, doubleEncodePath),
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${region}/${service}/${AWS_SIGV4.terminator}`;
  const stringToSign = [
    AWS_SIGV4.algorithm,
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const signingKey = [dateStamp, region, service, AWS_SIGV4.terminator].reduce(
    (key, part) => hmac(key, part),
    Buffer.from(`${AWS_SIGV4.keyPrefix}${secretAccessKey}`, "utf8") as crypto.BinaryLike
  );

  const signature = crypto
    .createHmac("sha256", signingKey)
    .update(stringToSign, "utf8")
    .digest("hex");

  return {
    ...headersToSign,
    Authorization:
      `${AWS_SIGV4.algorithm} Credential=${accessKeyId}/${credentialScope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

export const signAwsSigv4Request = signAwsRequest;
