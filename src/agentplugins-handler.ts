/**
 * AgentPlugins inline handler for the `preToolUse` hook.
 *
 * Bridges between agentplugins' universal `(ctx: HookContext) => HookResult`
 * signature and OpenCode's native `(input, output) => void` shape for
 * `tool.execute.before`). The OpenCode adapter invokes inline handlers with
 * `(input, output)` directly (see `buildHandlerInvocation` in
 * `@agentplugins/adapter-opencode`), so the function body is written in
 * OpenCode's native shape.
 *
 * TypeScript-vs-runtime seam: the universal type signature is
 * `(ctx: HookContext) => Promise<HookResult>`, but the OpenCode adapter
 * invokes the handler with `(input, output)`. This is the documented gap
 * until agentplugins upstream adds an opt-in toolInput-mutation channel to
 * HookResult.
 *
 * IMPORTANT: this handler is `.toString()`-serialized into the generated
 * OpenCode plugin and MUST remain self-contained — no module-scope
 * references, no helper calls outside the arrow function. The shell
 * rewriting logic is duplicated from `src/index.ts`; both must stay in sync.
 * (See TODO: file upstream issue about inline-handler serialization.)
 */
import type { HookContext, HookResult, InlineHookHandler } from "@agentplugins/core"

export const preToolUseHandler: InlineHookHandler["handler"] = (async (
  ...args: unknown[]
): Promise<HookResult> => {
  const input = args[0] as { tool: string }
  const output = args[1] as { args: { command?: unknown } }
  if (input.tool !== "bash") return { continue: true }
  const command = output.args.command
  if (!command || typeof command !== "string") return { continue: true }
  if (command.startsWith("snip ")) return { continue: true }

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
      if (char === "'" && !inDoubleQuote) inSingleQuote = !inSingleQuote
      else if (char === '"' && !inSingleQuote) inDoubleQuote = !inDoubleQuote
      else if (char === '|' && !inSingleQuote && !inDoubleQuote) {
        if (command[i + 1] === '|' || (i > 0 && command[i - 1] === '|')) { i++; continue }
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

  if (findFirstPipe(command) !== -1) {
    const pipeIdx = findFirstPipe(command)
    const firstCmd = command.slice(0, pipeIdx).trimEnd()
    const rest = command.slice(pipeIdx)
    output.args.command = snipCommand(firstCmd) + " " + rest
    return { continue: true }
  }

  const segments = command.split(OPERATOR_RE)
  if (segments.length === 1) {
    output.args.command = snipCommand(command)
    return { continue: true }
  }

  output.args.command = segments
    .map((segment) => OPERATOR_RE.test(segment) ? segment : snipCommand(segment))
    .join("")

  return { continue: true }
}) as InlineHookHandler["handler"]
