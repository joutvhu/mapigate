import type { MitmToolConfig } from "../../types.js";

export const toolConfig: MitmToolConfig = {
  id: "cursor",
  name: "Cursor",
  image: "/providers/cursor.png",
  desc: "Intercept Cursor IDE requests via MITM proxy (Coming Soon)",
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
};
