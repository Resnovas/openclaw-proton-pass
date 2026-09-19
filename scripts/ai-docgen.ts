/**
 * Generate `LLMS.md` from `ai-docs/src`.
 *
 * This replicates the pattern Effect uses in its own repository: prose and
 * runnable TypeScript live side by side under `ai-docs/src`, and one file is
 * assembled from them for an agent to read in a single pass. Effect's own
 * `@effect/ai-docgen` is unpublished, so the generator is reimplemented here
 * rather than depended on.
 *
 * The point of generating rather than hand-writing is that the examples are
 * ordinary `.ts` files in a project the compiler checks. Guidance that stops
 * compiling stops the build, instead of quietly teaching an agent an API that
 * no longer exists.
 *
 * Conventions, following Effect's:
 *
 * - A section is a directory under `ai-docs/src` with an `index.md`.
 * - Numeric prefixes (`10_`, `20_`) order the sections.
 * - Examples are `.ts` files beside the `index.md`, ordered the same way.
 * - An example's title comes from a leading JSDoc block with `@title`.
 * - `fixtures` directories are supporting code and are not rendered.
 *
 * Usage: node --experimental-strip-types scripts/ai-docgen.ts [--check]
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = fileURLToPath(new URL("..", import.meta.url))
const SRC = join(ROOT, "ai-docs/src")
const OUT = join(ROOT, "LLMS.md")

/** Strip the numeric ordering prefix from a directory or file name. */
const unprefixed = (name: string): string => name.replace(/^\d+_/, "")

/** The `@title` of an example, and the description beneath it. */
interface ExampleHeader {
  readonly title: string
  readonly description: string
  readonly body: string
}

/**
 * Split an example into its leading JSDoc header and the code that follows.
 *
 * The header is removed from the rendered code, because a title repeated
 * inside the snippet is noise to a reader who has just seen it as a heading.
 */
const splitExample = (source: string, fallback: string): ExampleHeader => {
  const match = /^\/\*\*([\s\S]*?)\*\/\n/.exec(source)
  if (match === null) {
    return { title: fallback, description: "", body: source.trim() }
  }

  const lines = (match[1] ?? "")
    .split("\n")
    .map((line) => line.replace(/^\s*\*\s?/, "").trimEnd())
    .filter((line, index, all) => !(line === "" && (index === 0 || index === all.length - 1)))

  let title = fallback
  const description: Array<string> = []
  for (const line of lines) {
    const tag = /^@title\s+(.*)$/.exec(line)
    if (tag !== null) {
      title = tag[1] ?? fallback
      continue
    }
    if (line.startsWith("@")) continue
    description.push(line)
  }

  return {
    title,
    description: description.join("\n").trim(),
    body: source.slice(match[0].length).trim()
  }
}

const sections = readdirSync(SRC, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== "fixtures")
  .map((entry) => entry.name)
  .sort()

if (sections.length === 0) {
  console.error(`no sections found under ${SRC}`)
  process.exit(1)
}

const parts: Array<string> = [
  "<!--",
  "  Generated from ai-docs/src by scripts/ai-docgen.ts. Do not edit by hand:",
  "  edit the sources and run `pnpm ai-docgen`.",
  "-->",
  "",
  "# openclaw-proton-pass for agents",
  "",
  "Guidance for an agent working on or with this codebase, assembled into one",
  "file so it can be read in a single pass. Every example below is a real file",
  "under `ai-docs/src`, compiled by `pnpm check`.",
  "",
  "For the human-facing documentation, see the `docs/` site. For the generated",
  "API reference, see `docs/reference/api`.",
  ""
]

let exampleCount = 0

for (const section of sections) {
  const dir = join(SRC, section)
  const indexPath = join(dir, "index.md")

  if (!statSync(indexPath, { throwIfNoEntry: false })?.isFile()) {
    console.error(`${section}: no index.md`)
    process.exit(1)
  }

  parts.push("---", "", readFileSync(indexPath, "utf8").trim(), "")

  const examples = readdirSync(dir)
    .filter((name) => name.endsWith(".ts"))
    .sort()

  for (const example of examples) {
    const { title, description, body } = splitExample(
      readFileSync(join(dir, example), "utf8"),
      unprefixed(example).replace(/\.ts$/, "")
    )
    exampleCount += 1

    parts.push(`### ${title}`, "")
    if (description !== "") parts.push(description, "")
    parts.push("```ts", body, "```", "")
  }
}

const rendered = `${parts.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`

if (process.argv.includes("--check")) {
  const existing = readFileSync(OUT, "utf8")
  if (existing !== rendered) {
    console.error("LLMS.md is out of date — run `pnpm ai-docgen` and commit the result")
    process.exit(1)
  }
  console.log("LLMS.md is up to date")
} else {
  writeFileSync(OUT, rendered)
  console.log(
    `LLMS.md written from ${sections.length} section(s) and ${exampleCount} example(s)`
  )
}
