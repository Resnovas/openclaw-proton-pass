/**
 * Verify the 1Password compatibility capability matrix covers every vendored
 * Connect path and pinned CLI command.
 *
 * Usage: node --experimental-strip-types scripts/check-matrix.ts check-matrix
 */
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = fileURLToPath(new URL("..", import.meta.url))
const MATRIX = join(ROOT, "docs/onepassword-compat/matrix.json")
const OPENAPI_DIR = join(ROOT, "externals/onepassword-connect-openapi")
const OP_HELP = join(ROOT, "externals/onepassword-cli/op-help-2.30.3.txt")

interface MatrixRow {
  readonly method?: string
  readonly path?: string
  readonly command?: string
  readonly status: string
  readonly reason: string
}

interface Matrix {
  readonly connect: ReadonlyArray<MatrixRow>
  readonly cli: ReadonlyArray<MatrixRow>
}

const loadMatrix = (): Matrix => JSON.parse(readFileSync(MATRIX, "utf8")) as Matrix

const openapiPaths = (): Set<string> => {
  const found = new Set<string>()
  for (const file of readdirSync(OPENAPI_DIR).filter((name) => name.endsWith(".yaml"))) {
    const text = readFileSync(join(OPENAPI_DIR, file), "utf8")
    const pathBlocks = text.split(/\n  \//)
    for (const block of pathBlocks.slice(1)) {
      const pathLine = block.split("\n")[0] ?? ""
      const path = `/${pathLine.replace(/:$/, "").trim()}`
      const methods = [...block.matchAll(/^\s{4}(get|post|put|patch|delete):/gim)].map((match) =>
        match[1]!.toUpperCase()
      )
      for (const method of methods) {
        found.add(`${method} ${path}`)
      }
    }
  }
  found.add("GET /heartbeat")
  found.add("GET /health")
  found.add("GET /v1/activity")
  return found
}

const matrixConnectKeys = (matrix: Matrix): Set<string> =>
  new Set(
    matrix.connect.map((row) => `${row.method ?? "GET"} ${row.path ?? ""}`.trim())
  )

const opHelpCommands = (): Set<string> => {
  const commands = new Set<string>()
  for (const line of readFileSync(OP_HELP, "utf8").split("\n")) {
    const trimmed = line.trim()
    if (trimmed.startsWith("#") || trimmed.length === 0) continue
    if (/^[a-z-]+ [a-z-]+$/.test(trimmed)) {
      commands.add(trimmed)
    } else if (/^[a-z-]+$/.test(trimmed) && !trimmed.startsWith("Flags")) {
      commands.add(trimmed)
    }
  }
  return commands
}

const matrixCliKeys = (matrix: Matrix): Set<string> =>
  new Set(matrix.cli.map((row) => row.command ?? ""))

const missing = (expected: Set<string>, actual: Set<string>): Array<string> =>
  [...expected].filter((key) => !actual.has(key)).sort()

const checkMatrix = (): void => {
  const matrix = loadMatrix()
  const connectExpected = openapiPaths()
  const connectActual = matrixConnectKeys(matrix)
  const connectMissing = missing(connectExpected, connectActual)

  const cliExpected = opHelpCommands()
  const cliActual = matrixCliKeys(matrix)
  const cliMissing = missing(cliExpected, cliActual)

  const problems: Array<string> = []
  if (connectMissing.length > 0) {
    problems.push(
      `Connect paths in vendored OpenAPI but not matrix:\n  ${connectMissing.join("\n  ")}`
    )
  }
  if (cliMissing.length > 0) {
    problems.push(
      `CLI commands in pinned op --help snapshot but not matrix:\n  ${cliMissing.join("\n  ")}`
    )
  }

  if (problems.length > 0) {
    console.error(problems.join("\n\n"))
    process.exit(1)
  }

  console.error(
    `matrix covers ${connectActual.size} Connect routes and ${cliActual.size} CLI commands`
  )
}

const command = process.argv[2]
if (command !== "check-matrix") {
  console.error("usage: check-matrix")
  process.exit(1)
}

checkMatrix()
