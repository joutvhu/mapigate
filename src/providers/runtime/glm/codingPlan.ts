/**
 * Z.ai coding-plan API key resolution. Mirrors the official ZCode CLI:
 * OAuth token -> business JWT -> default org/project -> "zcode-api-key" -> "apiKey.secretKey".
 * The OAuth token itself is NOT a model credential; the coding-plan key is.
 */

export interface GlmOAuthConfig {
  businessLoginUrl: string;
  apiBaseUrl: string;
  planApiKeyName: string;
}

export function isSuccessCode(code: unknown): boolean {
  return code === undefined || code === null || code === 0 || code === 200 || code === "0" || code === "200";
}

// Business endpoints answer { code, msg, data }; code 0/200 (or absent) is success.
async function fetchBusinessJson(url: string, options: RequestInit, label: string): Promise<any> {
  const response = await fetch(url, options);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Z.ai ${label} request failed (HTTP ${response.status}): ${text.slice(0, 200)}`);
  }
  let payload: any;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`Z.ai ${label} response is not valid JSON`);
  }
  if (!isSuccessCode(payload?.code) || payload?.success === false) {
    throw new Error(payload?.msg || `Z.ai ${label} returned business error ${payload?.code}`);
  }
  return payload?.data ?? payload ?? null;
}

function isDefaultName(name: unknown): boolean {
  const normalized = String(name || "").trim().toLowerCase();
  return normalized.includes("默认机构") || normalized.includes("默认项目") || normalized === "default";
}

// Prefer the default org and its non-team project (projectType "2" is a team project).
function pickOrgAndProject(customerInfo: any): { organizationId: string; projectId: string } | null {
  const organizations: any[] = Array.isArray(customerInfo?.organizations) ? customerInfo.organizations : [];
  const personalOrgs = organizations
    .map((organization) => ({
      organization,
      projects: (organization?.projects || []).filter((p: any) => String(p?.projectType ?? "").trim() !== "2"),
    }))
    .filter(({ organization, projects }) => Boolean(organization?.organizationId && projects.length));
  if (!personalOrgs.length) return null;

  const org = personalOrgs.find(({ organization }) => isDefaultName(organization.organizationName)) || personalOrgs[0];
  const project = org.projects.find((p: any) => isDefaultName(p?.projectName)) || org.projects[0];
  if (!org.organization?.organizationId || !project?.projectId) return null;
  return { organizationId: org.organization.organizationId, projectId: project.projectId };
}

async function exchangeBusinessToken(config: GlmOAuthConfig, zaiAccessToken: string): Promise<string> {
  const payload = await fetchBusinessJson(
    config.businessLoginUrl,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: zaiAccessToken }),
    },
    "business login"
  );
  const token = payload?.access_token?.trim() || payload?.accessToken?.trim();
  if (!token) throw new Error("Z.ai business login response is missing access_token");
  return token;
}

export async function resolveCodingPlanApiKey(
  config: GlmOAuthConfig,
  zaiAccessToken: string
): Promise<{ planApiKey: string; businessToken: string }> {
  const businessToken = await exchangeBusinessToken(config, zaiAccessToken);
  const authHeaders = { Authorization: `Bearer ${businessToken}`, "Content-Type": "application/json" };

  const customerInfo = await fetchBusinessJson(
    `${config.apiBaseUrl}/api/biz/customer/getCustomerInfo`,
    { headers: authHeaders },
    "customer info"
  );
  const location = pickOrgAndProject(customerInfo);
  if (!location) throw new Error("Unable to resolve Z.ai organization and project for the coding plan");

  const listUrl =
    `${config.apiBaseUrl}/api/biz/v1/organization/${location.organizationId}` +
    `/projects/${location.projectId}/api_keys`;
  const keys = (await fetchBusinessJson(listUrl, { headers: authHeaders }, "api keys")) || [];
  let keyEntry = Array.isArray(keys) ? keys.find((item: any) => item?.name === config.planApiKeyName) : null;
  if (!keyEntry) {
    keyEntry = await fetchBusinessJson(
      listUrl,
      { method: "POST", headers: authHeaders, body: JSON.stringify({ name: config.planApiKeyName }) },
      "api key create"
    );
  }

  const apiKey = String(keyEntry?.apiKey || "").trim();
  if (!apiKey) throw new Error("Z.ai api_keys response is missing apiKey");

  const secret = await fetchBusinessJson(
    `${listUrl}/copy/${encodeURIComponent(apiKey)}`,
    { headers: authHeaders },
    "api key copy"
  );
  const secretKey = String(secret?.secretKey || "").trim();
  if (!secretKey) throw new Error("Z.ai api key copy response is missing secretKey");

  return { planApiKey: `${apiKey}.${secretKey}`, businessToken };
}
