/**
 * Guard the publishable package against subtle tarball defects.
 *
 * Usage:
 *   node --experimental-strip-types scripts/check-package.ts
 */
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..")
const pkgRoot = join(root, "packages/openclaw-proton-pass")
const binDir = join(pkgRoot, "bin")
const cli = join(binDir, "openclaw-proton-pass.mjs")

const pkg = JSON.parse(readFileSync(join(pkgRoot, "package.json"), "utf8")) as {
  version: string
  bin: Record<string, string>
}
const manifest = JSON.parse(
  readFileSync(join(pkgRoot, "openclaw.plugin.json"), "utf8")
) as { version: string }

let failed = false

if (manifest.version !== pkg.version) {
  console.error(
    `openclaw.plugin.json version ${manifest.version} does not match package.json ${pkg.version}`
  )
  failed = true
}

const reported = execFileSync("node", [cli, "--version"], {
  encoding: "utf8"
}).trim()

if (reported !== pkg.version) {
  console.error(
    `openclaw-proton-pass --version reported ${reported}, expected ${pkg.version}`
  )
  failed = true
}

for (const relativePath of Object.values(pkg.bin)) {
  const executable = join(pkgRoot, relativePath)
  const source = readFileSync(executable, "utf8")
  if (!source.startsWith("#!/usr/bin/env node\n")) {
    console.error(`${relativePath}: shebang is not on the first line`)
    failed = true
  }
}

if (failed) {
  process.exit(1)
}

console.error(`package checks passed at version ${pkg.version}`)
