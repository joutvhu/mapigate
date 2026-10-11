import { signAwsSigv4Request } from "../../auth/awsSigv4.js";

export interface BedrockSigningOptions {
  url: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  headers: Record<string, string>;
  body: any;
  isStreaming: boolean;
}

export function buildSignedBedrockHeaders(options: BedrockSigningOptions): Record<string, string> {
  const { url, region, accessKeyId, secretAccessKey, sessionToken, headers, body, isStreaming } = options;
  const outgoing = { ...headers };
  delete outgoing["Authorization"];

  const signed = signAwsSigv4Request({
    method: "POST",
    url,
    region,
    service: "bedrock",
    accessKeyId,
    secretAccessKey,
    sessionToken,
    headers: outgoing,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

  const result = { ...outgoing, ...signed };
  if (isStreaming) {
    result["Accept"] = "application/vnd.amazon.eventstream";
  }
  return result;
}
