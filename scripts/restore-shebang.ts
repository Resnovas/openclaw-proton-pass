/**
 * Move the shebang back to byte 0 of every executable bundle.
 *
 * `@posthog/cli sourcemap process` injects a chunk-id preamble at the very top
 * of each JavaScript file it processes. esbuild had already put
 * `#!/usr/bin/env node` there, so injection pushes the shebang to the middle of
 * the first line and the file stops being executable: the kernel no longer sees
 * `#!` at byte 0 and hands the file to the shell, and Node refuses it too
 * because a shebang is only legal at the start of a source file.
 *
 * The published 1.0.2 bins all failed this way. Injection has to run against the
 * final bundle for stack traces to resolve, so the fix is to repair the first
 * line afterwards rather than to skip injection.
 *
 * Usage:
 *   node --experimental-strip-types scripts/restore-shebang.ts <dir>   # apply
 *   node --experimental-strip-types scripts/restore-shebang.ts <dir> --check
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const SHEBANG = "#!/usr/bin/env node"

const args = process.argv.slice(2)
const check = args.includes("--check")
const dir = args.find((a) => !a.startsWith("--"))

if (dir === undefined) {
  console.error("usage: restore-shebang.ts <dir> [--check]")
  process.exit(2)
}

let repaired = 0
let broken = 0

for (const entry of readdirSync(dir)) {
  if (!entry.endsWith(".mjs") && !entry.endsWith(".js")) continue
  const path = join(dir, entry)
  const source = readFileSync(path, "utf8")

  if (source.startsWith(SHEBANG)) continue

  // Plugin entries and other library bundles are not executables.
  if (!source.includes(SHEBANG)) continue

  if (check) {
    console.error(`${entry}: shebang is not on the first line`)
    broken += 1
    continue
  }

  // Remove the displaced copy and re-prepend it. Only the first occurrence is
  // touched: a later one inside a bundled string is not ours to rewrite.
  writeFileSync(path, `${SHEBANG}\n${source.replace(SHEBANG, "")}`)
  console.error(`${entry}: shebang restored`)
  repaired += 1
}

if (broken > 0) process.exit(1)
if (!check) console.error(`restore-shebang: ${repaired} file(s) repaired`)
