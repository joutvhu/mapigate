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
    body.messages = body.messages.map((msg: any) => {
      if (msg && typeof msg === "object" && msg.role === "system") {
        return { ...msg, role: "developer" };
      }
      return msg;
    });
  }
  if (Array.isArray(body?.input)) {
    body.input = body.input.map((item: any) => {
      if (item && typeof item === "object" && item.role === "system") {
        return { ...item, role: "developer" };
      }
      return item;
    });
  }
}

export function stripStoredItemReferences(body: any): void {
  if (Array.isArray(body?.input)) {
    body.input = body.input
      .filter((item: any) => {
        if (typeof item === "string" && SERVER_ID_PATTERN.test(item)) return false;
        if (item && typeof item === "object" && !Array.isArray(item)) {
          if (item.type === "item_reference") return false;
        }
        return true;
      })
      .map((item: any) => {
        if (item && typeof item === "object" && !Array.isArray(item)) {
          if (typeof item.id === "string" && SERVER_ID_PATTERN.test(item.id)) {
            const next = { ...item };
            delete next.id;
            return next;
          }
        }
        return item;
      });
  }
  if (Array.isArray(body?.messages)) {
    body.messages = body.messages.map((msg: any) => {
      if (msg && typeof msg === "object" && typeof msg.id === "string" && SERVER_ID_PATTERN.test(msg.id)) {
        const next = { ...msg };
        delete next.id;
        return next;
      }
      return msg;
    });
  }
}

export function sanitizeCodexTools(body: any): void {
  if (!Array.isArray(body?.tools)) return;
  body.tools = body.tools.map((tool: any) => {
    if (!tool || typeof tool !== "object") return tool;
    const nextTool = { ...tool };
    if (tool.parameters && typeof tool.parameters === "object") {
      nextTool.parameters = stripCodexUnsupportedPatterns(tool.parameters);
    }
    if (tool.function && typeof tool.function === "object") {
      nextTool.function = { ...tool.function };
      if (tool.function.parameters && typeof tool.function.parameters === "object") {
        nextTool.function.parameters = stripCodexUnsupportedPatterns(tool.function.parameters);
      }
    }
    return nextTool;
  });
}
