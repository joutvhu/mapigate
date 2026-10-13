const UNICODE_PROPERTY_ESCAPE = /(^|[^\\])(\\\\)*\\[pP]\{/;
const SERVER_ID_PATTERN = /^(?:rs|fc|resp|msg)_[A-Za-z0-9]+$/;

export function hasUnicodePropertyEscape(pattern: string): boolean {
  return typeof pattern === "string" && UNICODE_PROPERTY_ESCAPE.test(pattern);
}

function stripNode(node: any): any {
  if (Array.isArray(node)) {
    return node.map((item) => stripNode(item));
  }
  if (!node || typeof node !== "object") return node;

  const next: Record<string, any> = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === "pattern" && typeof value === "string" && hasUnicodePropertyEscape(value)) {
      continue;
    }
    if (key === "properties" && value && typeof value === "object" && !Array.isArray(value)) {
      const props: Record<string, any> = {};
      for (const [propName, propSchema] of Object.entries(value)) {
        props[propName] = stripNode(propSchema);
      }
      next[key] = props;
      continue;
    }
    next[key] = stripNode(value);
  }
  return next;
}

export function stripCodexUnsupportedPatterns(schema: any): any {
  return stripNode(schema);
}

export function convertSystemToDeveloperRole(body: any): void {
  if (Array.isArray(body?.messages)) {
    for (const msg of body.messages) {
      if (msg && msg.role === "system") {
        msg.role = "developer";
      }
    }
  }
  if (Array.isArray(body?.input)) {
    for (const item of body.input) {
      if (item && typeof item === "object" && item.role === "system") {
        item.role = "developer";
      }
    }
  }
}

export function stripStoredItemReferences(body: any): void {
  if (Array.isArray(body?.input)) {
    body.input = body.input.filter((item: any) => {
      if (typeof item === "string" && SERVER_ID_PATTERN.test(item)) return false;
      if (item && typeof item === "object" && !Array.isArray(item)) {
        if (item.type === "item_reference") return false;
        if (typeof item.id === "string" && SERVER_ID_PATTERN.test(item.id)) {
          delete item.id;
        }
      }
      return true;
    });
  }
  if (Array.isArray(body?.messages)) {
    for (const msg of body.messages) {
      if (msg && typeof msg.id === "string" && SERVER_ID_PATTERN.test(msg.id)) {
        delete msg.id;
      }
    }
  }
}

export function sanitizeCodexTools(body: any): void {
  if (!Array.isArray(body?.tools)) return;
  for (const tool of body.tools) {
    if (!tool || typeof tool !== "object") continue;
    if (tool.parameters && typeof tool.parameters === "object") {
      tool.parameters = stripCodexUnsupportedPatterns(tool.parameters);
    }
    if (tool.function?.parameters && typeof tool.function.parameters === "object") {
      tool.function.parameters = stripCodexUnsupportedPatterns(tool.function.parameters);
    }
  }
}
