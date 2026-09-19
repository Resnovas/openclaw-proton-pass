/**
 * Generate the API reference pages of the documentation site.
 *
 * `@effect/docgen` reads the JSDoc on every exported symbol, type-checks and
 * executes each `@example`, and emits GitHub Pages markdown. This script runs
 * it over each library and rewrites that output as Docs7 MDX, so the published
 * reference is produced from the source rather than written alongside it and
 * left to drift.
 *
 * The examples are the reason this runs inside `pnpm verify` rather than only
 * at publish time: docgen fails if an example no longer compiles or no longer
 * asserts what it claims, which makes a wrong example a build failure instead
 * of a page someone has to notice is wrong.
 *
 * Usage: node --experimental-strip-types scripts/docs-api.ts
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = fileURLToPath(new URL("..", import.meta.url))
const OUT = join(ROOT, "docs/reference/api")

interface Library {
  readonly slug: string
  readonly dir: string
  readonly title: string
  readonly summary: string
}

const LIBRARIES: ReadonlyArray<Library> = [
  {
    slug: "domain",
    dir: "libs/domain",
    title: "Domain",
    summary: "The vocabulary: secret ids, vault references, routes, the wire protocol and the error union."
  },
  {
    slug: "config",
    dir: "libs/config",
    title: "Config",
    summary: "Every filesystem path and environment variable this system reads, resolved in one place."
  },
  {
    slug: "pass-cli",
    dir: "libs/pass-cli",
    title: "Pass CLI",
    summary: "The two services that talk to Proton Pass: session bootstrap and secret resolution."
  },
  {
    slug: "telemetry",
    dir: "libs/telemetry",
    title: "Telemetry",
    summary: "The closed event union and the filters that make a secret structurally untransmittable."
  },
  {
    slug: "resolver",
    dir: "apps/resolver",
    title: "resolver",
    summary: "The exec secret provider: one JSON request on stdin, one response on stdout."
  },
  {
    slug: "pass-run",
    dir: "apps/pass-run",
    title: "pass-run",
    summary: "The stdio MCP wrapper, which resolves environment references as it launches the child."
  },
  {
    slug: "mcp-auth-proxy",
    dir: "apps/mcp-auth-proxy",
    title: "mcp-auth-proxy",
    summary: "The loopback hop: route matching, header rewriting, forwarding and relay."
  },
  {
    slug: "cli",
    dir: "apps/cli",
    title: "cli",
    summary: "setup and doctor, and the layer that supplies them."
  }
]

/** The licence header that opens every source file, and must not be published. */
const LICENCE_MARKER = "DELETING THIS NOTICE AUTOMATICALLY VOIDS YOUR LICENSE"

/**
 * Read a module's own description from its `@module` doc comment.
 *
 * docgen takes the first comment in a file as the module overview, and in this
 * codebase that is always the licence header. The description is therefore read
 * from the source directly, from a block tagged `@module` so the choice is
 * explicit rather than positional.
 */
const moduleSummary = (source: string): string => {
  const match = /\/\*\*([\s\S]*?)\*\//g
  let block: RegExpExecArray | null
  while ((block = match.exec(source)) !== null) {
    const body = block[1] ?? ""
    if (!body.includes("@module")) continue
    return body
      .split("\n")
      .map((line) => line.replace(/^\s*\*\s?/, ""))
      .filter((line) => !line.trim().startsWith("@"))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim()
  }
  return ""
}

/**
 * Make generated markdown safe to render as MDX.
 *
 * Signatures live inside fenced blocks and are left alone; prose is escaped so
 * a stray `<` or `{` is read as text rather than as the start of an element.
 */
const escapeProse = (markdown: string): string => {
  const lines = markdown.split("\n")
  let fenced = false
  return lines
    .map((line) => {
      if (line.startsWith("```")) {
        fenced = !fenced
        return line
      }
      if (fenced) return line
      return line.replace(/(?<!`)<(?![a-zA-Z/!])/g, "&lt;").replace(/\{/g, "&#123;")
    })
    .join("\n")
}

/**
 * Quote a value for a YAML front-matter scalar.
 *
 * A description routinely contains `: `, which YAML reads as a mapping and
 * then rejects, so these are always quoted rather than quoted-when-needed.
 */
const yaml = (value: string): string =>
  `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`

/** Turn one docgen module page into a Docs7 page. */
const toMdx = (markdown: string, title: string, description: string): string => {
  let body = markdown

  // Drop the Jekyll front matter docgen writes for GitHub Pages.
  body = body.replace(/^---\n[\s\S]*?\n---\n/, "").trimStart()

  // Drop the module overview. docgen takes the first comment in a file as the
  // overview, and in this codebase that is always the licence header - which
  // must not be republished as though it described the module.
  if (body.includes(LICENCE_MARKER)) {
    body = body.replace(/^##\s+.*\boverview\b[\s\S]*?\n---\n/m, "").trimStart()
  }

  // Docs7 renders its own table of contents.
  body = body.replace(/<h2 class="text-delta">Table of contents<\/h2>[\s\S]*?\n---\n/, "").trimStart()

  // `{@link Name}` is a JSDoc reference docgen passes through verbatim.
  body = body.replace(/\{@link\s+([^}]+)\}/g, "`$1`")

  // The page title comes from the front matter, so demote everything by one.
  body = body.replace(/^(#{1,5}) /gm, "#$1 ")

  body = escapeProse(body).trim()

  const frontMatter = [
    "---",
    `title: ${yaml(title)}`,
    `description: ${yaml(description)}`,
    "---",
    ""
  ].join("\n")
  return `${frontMatter}\n${body}\n`
}

const run = (library: Library): ReadonlyArray<string> => {
  const cwd = join(ROOT, library.dir)
  rmSync(join(cwd, ".docgen"), { recursive: true, force: true })

  process.stdout.write(`docgen ${library.dir}\n`)
  execFileSync(join(ROOT, "node_modules/.bin/docgen"), [], {
    cwd,
    stdio: "inherit",
    env: { ...process.env, PATH: `${join(ROOT, "node_modules/.bin")}:${process.env["PATH"] ?? ""}` }
  })

  const modulesDir = join(cwd, ".docgen/modules")
  const outDir = join(OUT, library.slug)
  mkdirSync(outDir, { recursive: true })

  const pages: Array<string> = []
  for (const entry of readdirSync(modulesDir).sort()) {
    if (!entry.endsWith(".ts.md")) continue
    const name = entry.replace(/\.ts\.md$/, "")
    const sourcePath = join(cwd, "src", `${name}.ts`)
    const description =
      (existsSync(sourcePath) ? moduleSummary(readFileSync(sourcePath, "utf8")) : "") ||
      `${library.title} module: ${name}`

    writeFileSync(
      join(outDir, `${name}.mdx`),
      toMdx(readFileSync(join(modulesDir, entry), "utf8"), `${name}.ts`, description)
    )
    pages.push(`reference/api/${library.slug}/${name}`)
  }

  rmSync(join(cwd, ".docgen"), { recursive: true, force: true })
  return pages
}

/** The landing page for the reference, linking each library. */
const indexPage = (): string => {
  const cardsFor = (kind: "libs" | "apps") =>
    LIBRARIES.filter((library) => library.dir.startsWith(kind))
      .map(
        (library) =>
          `  <Card title="${library.title}" href="/reference/api/${library.slug}/index">\n    ${library.summary}\n  </Card>`
      )
      .join("\n")

  return `---
title: "API reference"
description: "Generated from the JSDoc on every exported symbol, with every example type-checked and executed."
---

These pages are generated by [\`@effect/docgen\`](https://github.com/Effect-TS/effect/tree/main/packages/tools/docgen)
from the source. Every \`@example\` on this site is compiled and run as part of
\`pnpm verify\`, so an example that stopped being true would fail the build
rather than sit here misleading you.

Edit the JSDoc in \`libs/*/src\` or \`apps/*/src\` and run \`pnpm docs:api\` to
regenerate.

## Libraries

The reusable contracts. Each is an internal workspace package.

<Columns cols={2}>
${cardsFor("libs")}
</Columns>

## Executables

The four binaries. Their entry points are excluded, because importing one would
start the program; they are covered by tests that run the built binaries end to
end.

<Columns cols={2}>
${cardsFor("apps")}
</Columns>
`
}

/** A per-library index listing its modules. */
const libraryIndex = (library: Library, pages: ReadonlyArray<string>): string => {
  const items = pages
    .map((page) => {
      const name = page.split("/").pop() ?? page
      return `- [${name}.ts](/${page})`
    })
    .join("\n")

  return `---
title: ${yaml(library.title)}
description: ${yaml(library.summary)}
---

${library.summary}

${items}
`
}

/** Every generated file's current contents, so `--check` can detect drift. */
const snapshot = (dir: string): Map<string, string> => {
  const found = new Map<string, string>()
  if (!existsSync(dir)) return found
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      for (const [path, contents] of snapshot(full)) found.set(path, contents)
    } else {
      found.set(full, readFileSync(full, "utf8"))
    }
  }
  return found
}

const check = process.argv.includes("--check")
const docsJsonPath = join(ROOT, "docs/docs.json")
const before = snapshot(OUT)
before.set(docsJsonPath, readFileSync(docsJsonPath, "utf8"))

rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

const navigation: Array<{ group: string; pages: Array<string> }> = []

for (const library of LIBRARIES) {
  const pages = run(library)
  writeFileSync(join(OUT, library.slug, "index.mdx"), libraryIndex(library, pages))
  navigation.push({
    group: library.title,
    pages: [`reference/api/${library.slug}/index`, ...pages]
  })
}

writeFileSync(join(OUT, "index.mdx"), indexPage())

// Keep the site navigation in step with what was just generated, so a new
// module appears in the sidebar without anyone remembering to add it.
const docsJson = JSON.parse(readFileSync(docsJsonPath, "utf8")) as {
  navigation: { tabs: Array<{ tab: string; groups?: Array<unknown> }> }
}
const referenceTab = docsJson.navigation.tabs.find((tab) => tab.tab === "API reference")
if (referenceTab === undefined) {
  throw new Error(`no "API reference" tab in ${docsJsonPath}`)
}
referenceTab.groups = [{ group: "Overview", pages: ["reference/api/index"] }, ...navigation]
writeFileSync(docsJsonPath, `${JSON.stringify(docsJson, null, 2)}\n`)

const total = navigation.reduce((count, group) => count + group.pages.length - 1, 0)
process.stdout.write(`\n${total} module page(s) written to ${dirname(OUT)}/api\n`)

if (check) {
  const after = snapshot(OUT)
  after.set(docsJsonPath, readFileSync(docsJsonPath, "utf8"))

  const drifted = [
    ...[...after.keys()].filter((path) => before.get(path) !== after.get(path)),
    ...[...before.keys()].filter((path) => !after.has(path))
  ].sort()

  if (drifted.length > 0) {
    process.stderr.write(
      `\nthe generated API reference is out of date:\n  ${drifted
        .map((path) => path.replace(ROOT, ""))
        .join("\n  ")}\n\nrun \`pnpm docs:api\` and commit the result\n`
    )
    process.exit(1)
  }
  process.stdout.write("generated API reference is up to date\n")
}
