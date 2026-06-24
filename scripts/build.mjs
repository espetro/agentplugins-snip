#!/usr/bin/env node
/**
 * Builds the OpenCode output from agentplugins.config.ts without depending
 * on @agentplugins/cli (not yet published). Invokes the adapter directly.
 */
import { readFile, writeFile, mkdir, rm } from "node:fs/promises"
import { existsSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { build } from "esbuild"
import { createOpenCodeAdapter } from "@agentplugins/adapter-opencode"

const ROOT = resolve(import.meta.dirname, "..")
const MANIFEST_PATH = resolve(ROOT, "agentplugins.config.ts")
const OUT_DIR = resolve(ROOT, "dist", "opencode")

async function loadManifest() {
  const tmpFile = join(ROOT, ".cache", "manifest.mjs")
  await mkdir(dirname(tmpFile), { recursive: true })
  await build({
    entryPoints: [MANIFEST_PATH],
    outfile: tmpFile,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "es2022",
    logLevel: "silent",
  })
  const mod = await import(pathToFileURL(tmpFile).href)
  if (!mod.default) {
    throw new Error("agentplugins.config.ts must export a default manifest")
  }
  return mod.default
}

async function main() {
  const manifest = await loadManifest()
  const adapter = createOpenCodeAdapter()
  const issues = adapter.validate(manifest)
  const errors = issues.filter((i) => i.severity === "error")
  if (errors.length) {
    for (const i of errors) console.error(`[validate] ${i.message}`)
    process.exit(1)
  }

  const out = adapter.compile(manifest)
  for (const w of out.warnings) console.warn(`[warn] ${w}`)
  for (const i of out.issues) {
    if (i.severity === "warning") console.warn(`[issue] ${i.message}`)
    else console.error(`[issue] ${i.message}`)
  }

  if (existsSync(OUT_DIR)) await rm(OUT_DIR, { recursive: true })
  await mkdir(OUT_DIR, { recursive: true })

  for (const file of out.files) {
    const dest = join(OUT_DIR, file.path)
    await mkdir(dirname(dest), { recursive: true })
    await writeFile(dest, file.content, "utf8")
    console.log(`[write] ${pathToFileURL(dest).pathname}`)
  }

  console.log("[ok] opencode build complete")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
