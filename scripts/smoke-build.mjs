#!/usr/bin/env node
/**
 * Loads the generated OpenCode plugin and exercises its tool.execute.before
 * hook with representative inputs to confirm the agentplugins build pipeline
 * produces a working, self-contained OpenCode plugin.
 */
import { pathToFileURL } from "node:url"
import { resolve, dirname } from "node:path"

const ROOT = resolve(import.meta.dirname, "..")
const PLUGIN_PATH = resolve(ROOT, "dist", "opencode", "snip-shell-filter.ts")

const plugin = (await import(pathToFileURL(PLUGIN_PATH).href)).default
const hooks = await plugin({})

if (typeof hooks["tool.execute.before"] !== "function") {
  console.error("[fail] tool.execute.before hook not registered")
  process.exit(1)
}

const hook = hooks["tool.execute.before"]

const cases = [
  { name: "simple", input: { tool: "bash" }, output: { args: { command: "ls -la" } }, expect: "snip ls -la" },
  { name: "pipe",  input: { tool: "bash" }, output: { args: { command: "cat file.txt | grep foo" } }, expect: "snip cat file.txt | grep foo" },
  { name: "and",   input: { tool: "bash" }, output: { args: { command: "ls && echo done" } }, expect: "snip ls && snip echo done" },
  { name: "env",   input: { tool: "bash" }, output: { args: { command: "FOO=bar ls" } }, expect: "FOO=bar snip ls" },
  { name: "noop",  input: { tool: "read" }, output: { args: { command: "ls" } }, expect: "ls" },
  { name: "already", input: { tool: "bash" }, output: { args: { command: "snip ls" } }, expect: "snip ls" },
  { name: "builtin-cd", input: { tool: "bash" }, output: { args: { command: "cd /tmp" } }, expect: "cd /tmp" },
]

let pass = 0, fail = 0
for (const c of cases) {
  const out = structuredClone(c)
  await hook(c.input, c.output)
  const got = c.output.args.command
  if (got === c.expect) {
    console.log(`[ok]  ${c.name}: ${JSON.stringify(got)}`)
    pass++
  } else {
    console.error(`[fail] ${c.name}: expected ${JSON.stringify(c.expect)}, got ${JSON.stringify(got)}`)
    fail++
  }
}

console.log(`\n${pass}/${cases.length} cases passed`)
process.exit(fail > 0 ? 1 : 0)
