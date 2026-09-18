/**
 * Report how many times each covered line actually ran.
 *
 * Line coverage answers "did this run at all". It says nothing about whether a
 * line ran once, in a single happy path, or repeatedly across success, failure
 * and boundary cases. This reports the depth behind the percentage: the mean
 * executions per line, and the share of lines exercised by more than one path.
 *
 * Usage: node --experimental-strip-types scripts/coverage-depth.ts [minimum]
 */
import { readFileSync } from "node:fs"

interface FileCoverage {
  readonly statementMap: Record<string, { start: { line: number } }>
  readonly s: Record<string, number>
}

const report = JSON.parse(
  readFileSync(new URL("../coverage/coverage-final.json", import.meta.url), "utf8")
) as Record<string, FileCoverage>

const minimum = Number(process.argv[2] ?? "2")

let totalLines = 0
let totalHits = 0
let multiplyCovered = 0
const thin: Array<string> = []

for (const [path, file] of Object.entries(report)) {
  const perLine = new Map<number, number>()
  for (const [id, count] of Object.entries(file.s)) {
    const line = file.statementMap[id]?.start.line
    if (line === undefined) continue
    perLine.set(line, Math.max(perLine.get(line) ?? 0, count))
  }

  const relative = path.split("openclaw-proton-pass/")[1] ?? path
  const counts = [...perLine.values()]
  if (counts.length === 0) continue

  const hits = counts.reduce((sum, count) => sum + count, 0)
  const deep = counts.filter((count) => count >= minimum).length
  totalLines += counts.length
  totalHits += hits
  multiplyCovered += deep

  const depth = (hits / counts.length).toFixed(1)
  const share = ((deep / counts.length) * 100).toFixed(0)
  console.log(`  ${share.padStart(3)}%  x${depth.padStart(6)}  ${relative}`)
  if (deep < counts.length) {
    thin.push(
      `${relative}: ${counts.length - deep} line(s) run fewer than ${minimum} times`
    )
  }
}

console.log("")
console.log(`lines measured:        ${totalLines}`)
console.log(`mean executions/line:  ${(totalHits / totalLines).toFixed(1)}`)
console.log(
  `run ${minimum}+ times:         ${multiplyCovered}/${totalLines} ` +
    `(${((multiplyCovered / totalLines) * 100).toFixed(1)}%)`
)

if (thin.length > 0) {
  console.log("")
  for (const line of thin) console.log(`  ${line}`)
}
