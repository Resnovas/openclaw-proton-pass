/**
 * Enforce the API contract documentation rules against the declaration output.
 *
 * The rule this implements is dist-first: a contract is only useful to a
 * consumer - or to an agent generating tests - if it survives into
 * `dist/**\/*.d.ts`, where the implementation is no longer visible. Checking the
 * sources would pass on comments that TypeScript then dropped.
 *
 * Every exported callable must carry:
 *
 * - `@remarks` stating contract behaviour, not just intent
 * - a typed `@example`
 * - `@param` for every parameter
 * - `@returns`, unless it returns nothing
 *
 * Non-callable exports - schemas, layers, service classes, plain values - are
 * out of scope here; their descriptions are enforced separately by docgen's
 * `enforceDescriptions`.
 *
 * Usage: node --experimental-strip-types scripts/check-contracts.ts
 */
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"

const ROOT = fileURLToPath(new URL("..", import.meta.url))

/** Entry points and barrels: no contracts of their own to document. */
const SKIP = new Set(["main.d.ts", "index.d.ts"])

/** Return types that need no `@returns`, because there is no return value. */
const VOID_RETURNS = new Set(["void", "Promise<void>", "undefined"])

const declarationFiles = (dir: string): Array<string> => {
  const found: Array<string> = []
  if (!existsSync(dir)) return found
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) found.push(...declarationFiles(full))
    else if (entry.name.endsWith(".d.ts") && !SKIP.has(entry.name)) found.push(full)
  }
  return found
}

const projects = [
  ...readdirSync(join(ROOT, "libs")).map((name) => join(ROOT, "libs", name)),
  ...readdirSync(join(ROOT, "apps")).map((name) => join(ROOT, "apps", name))
]

const sources = projects.flatMap((project) => declarationFiles(join(project, "dist")))

if (sources.length === 0) {
  console.error("no declaration output found - run `pnpm build` first")
  process.exit(1)
}

interface Callable {
  readonly name: string
  readonly parameters: ReadonlyArray<string>
  readonly returns: string
  readonly node: ts.Node
}

/** The exported callables declared at the top level of one declaration file. */
const callables = (file: ts.SourceFile): Array<Callable> => {
  const found: Array<Callable> = []

  for (const statement of file.statements) {
    const exported = ts
      .getModifiers(statement as ts.HasModifiers)
      ?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
    if (exported !== true) continue

    if (ts.isFunctionDeclaration(statement) && statement.name !== undefined) {
      found.push({
        name: statement.name.text,
        parameters: statement.parameters.map((parameter) => parameter.name.getText(file)),
        returns: statement.type?.getText(file) ?? "unknown",
        node: statement
      })
      continue
    }

    if (!ts.isVariableStatement(statement)) continue
    for (const declaration of statement.declarationList.declarations) {
      const type = declaration.type
      // A `const` whose declared type is a function type. Anything else - a
      // schema, a layer, an Effect value - is not a callable contract.
      if (type === undefined || !ts.isFunctionTypeNode(type)) continue
      found.push({
        name: declaration.name.getText(file),
        parameters: type.parameters.map((parameter) => parameter.name.getText(file)),
        returns: type.type.getText(file),
        // The doc comment attaches to the statement, not the declaration.
        node: statement
      })
    }
  }

  return found
}

const tagsOf = (node: ts.Node): Array<ts.JSDocTag> => [...ts.getJSDocTags(node)]

const hasTag = (tags: ReadonlyArray<ts.JSDocTag>, name: string): boolean =>
  tags.some((tag) => tag.tagName.text === name)

const documentedParameters = (tags: ReadonlyArray<ts.JSDocTag>): Set<string> => {
  const names = new Set<string>()
  for (const tag of tags) {
    if (!ts.isJSDocParameterTag(tag)) continue
    names.add(tag.name.getText())
  }
  return names
}

const problems: Array<string> = []
let checked = 0

for (const path of sources) {
  const file = ts.createSourceFile(
    path,
    readFileSync(path, "utf8"),
    ts.ScriptTarget.ES2022,
    true
  )

  for (const callable of callables(file)) {
    checked += 1
    const where = `${relative(ROOT, path)}#${callable.name}`
    const tags = tagsOf(callable.node)

    if (!hasTag(tags, "remarks")) {
      problems.push(`${where}: missing @remarks`)
    }
    if (!hasTag(tags, "example")) {
      problems.push(`${where}: missing @example`)
    }

    const documented = documentedParameters(tags)
    for (const parameter of callable.parameters) {
      if (!documented.has(parameter)) {
        problems.push(`${where}: missing @param for \`${parameter}\``)
      }
    }

    if (!VOID_RETURNS.has(callable.returns.trim()) && !hasTag(tags, "returns")) {
      problems.push(`${where}: missing @returns`)
    }
  }
}

if (problems.length > 0) {
  console.error(
    `API contract documentation is incomplete in the declaration output:\n  ${problems.join("\n  ")}\n`
  )
  console.error(
    "Every exported callable needs @remarks, a typed @example, @param for each\n" +
      "parameter, and @returns unless it returns nothing."
  )
  process.exit(1)
}

console.log(`${checked} exported callable(s) carry a complete contract in dist/**/*.d.ts`)
