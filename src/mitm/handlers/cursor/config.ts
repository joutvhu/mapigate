import type { MitmToolConfig } from "../../types.js";

export const toolConfig: MitmToolConfig = {
  id: "cursor",
  name: "Cursor",
  image: "/assets/providers/cursor/icon.png",
  desc: "Intercept Cursor IDE requests via MITM proxy (Coming Soon)",
  iconBg: "#FFFFFF",
  hosts: [
    "api2.cursor.sh",
  ],
  urlPatterns: [
    "/BidiAppend",
    "/RunSSE",
    "/RunPoll",
    "/Run",
  ],
  defaultHost: "127.0.0.1 api2.cursor.sh",
  matchesHost: (h: string) => h.includes("cursor.sh"),
};
