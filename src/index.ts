import { execFileSync } from "node:child_process"
import type { Hooks, Plugin } from "@opencode-ai/plugin"

const ENV_VAR_RE = /^([A-Za-z_][A-Za-z0-9_]*=[^\s]* +)*/
const UNPROXYABLE_COMMANDS = new Set([
  "cd", "source", ".", "export", "alias", "unset", "set", "shopt", "eval", "exec",
])
const OPERATOR_RE = /(\s*(?:&&|\|\||;)\s*|\s&\s?)/

function findFirstPipe(command: string): number {
  let inSingleQuote = false
  let inDoubleQuote = false

  for (let i = 0; i < command.length; i++) {
    const char = command[i]

    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote
    } else if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote
    } else if (char === '|' && !inSingleQuote && !inDoubleQuote) {
      if (command[i + 1] === '|' || (i > 0 && command[i - 1] === '|')) {
        i++
        continue
      }
      return i
    }
  }

  return -1
}

function snipCommand(command: string): string {
  const envPrefix = (command.match(ENV_VAR_RE) ?? [""])[0]
  const bareCmd = command.slice(envPrefix.length).trim()
  if (!bareCmd) return command
  if (UNPROXYABLE_COMMANDS.has(bareCmd.split(/\s+/)[0])) return command
  return `${envPrefix}snip ${bareCmd}`
}

/**
 * Mutates `output.args.command` by prefixing each executable segment with `snip `.
 *
 * Pure: no side effects beyond the mutation. Safe to call from any hook runtime
 * that hands us `(input, output)` shaped like OpenCode's `tool.execute.before`
 * signature (which the agentplugins OpenCode adapter does).
 */
export const toolExecuteBefore: NonNullable<Hooks["tool.execute.before"]> = async (input, output) => {
  if (input.tool !== "bash") return

  const command = output.args.command
  if (!command || typeof command !== "string") return
  if (command.startsWith("snip ")) return

  if (findFirstPipe(command) !== -1) {
    const pipeIdx = findFirstPipe(command)
    const firstCmd = command.slice(0, pipeIdx).trimEnd()
    const rest = command.slice(pipeIdx)
    output.args.command = snipCommand(firstCmd) + ' ' + rest
    return
  }

  const segments = command.split(OPERATOR_RE)

  if (segments.length === 1) {
    output.args.command = snipCommand(command)
    return
  }

  output.args.command = segments
    .map((segment) => OPERATOR_RE.test(segment) ? segment : snipCommand(segment))
    .join("")
}

let snipCached: boolean | null = null

/**
 * Probe whether the `snip` binary is on PATH. Uses Node's `child_process` so
 * the check works under any runtime — not just OpenCode's Bun-shell.
 */
export function isSnipAvailable(): boolean {
  if (snipCached !== null) return snipCached
  try {
    execFileSync("which", ["snip"], { stdio: "ignore" })
    snipCached = true
  } catch {
    snipCached = false
  }
  return snipCached
}

/**
 * Legacy OpenCode plugin loader. Kept for backwards compatibility with
 * `opencode.json` consumers that install via npm directly. The agentplugins
 * build path bypasses this and inlines `toolExecuteBefore` directly.
 */
export const SnipPlugin: Plugin = async () => {
  if (!isSnipAvailable()) {
    console.warn("[snip] snip binary not found in PATH — plugin disabled")
    return {}
  }

  return {
    "tool.execute.before": toolExecuteBefore,
  }
}

export default SnipPlugin
