import { definePlugin } from "@agentplugins/core"
import { preToolUseHandler } from "./src/agentplugins-handler.js"

export default definePlugin({
  name: "snip-shell-filter",
  version: "1.0.0",
  description:
    "Prefix every shell command with `snip` to compress noisy tool output and reduce LLM token consumption on OpenCode.",
  license: "MIT",
  keywords: ["snip", "shell", "bash", "token-saver", "opencode"],
  targets: ["opencode"],
  hooks: {
    preToolUse: {
      matcher: "bash",
      handler: {
        type: "inline",
        handler: preToolUseHandler,
      },
    },
  },
})
