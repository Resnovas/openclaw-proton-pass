/*
 * Project: openclaw-proton-pass
 * File: doctor.ts
 * Last Modified: 2026-09-18
 *
 * Contributing: Please read through our contributing guidelines. Included are directions for opening issues, coding standards,
 * and notes on development. These can be found at
 * https://github.com/Resnovas/openclaw-proton-pass/blob/main/CONTRIBUTING.md
 *
 * Code of Conduct: This project abides by the Contributor Covenant, v2.0. Please interact in ways that contribute to an open,
 * welcoming, diverse, inclusive, and healthy community. Our Code of Conduct can be found at
 * https://github.com/Resnovas/openclaw-proton-pass/blob/main/CODE_OF_CONDUCT.md
 *
 * Copyright (c) 2026 Jonathan Stevens T/A Resnovas. All Rights Reserved
 * LICENSE: Fair Core License, Version 1.0, MIT Future License (FCL-1.0-MIT)
 *
 * This program has been provided under confidence of the copyright holder and is licensed for copying, distribution and
 * modification under the terms of the Fair Core License, Version 1.0, MIT Future License (FCL-1.0-MIT) published as the License, or
 * (at your option) any later version of this license. You must not move, change, disable, or circumvent the license key functionality
 * in the Software; or modify any portion of the Software protected by the license key to: enable access to the protected
 * functionality without a valid license key; or remove the protected functionality. This program is distributed in the hope that it
 * will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A
 * PARTICULAR PURPOSE. See the Fair Core License, Version 1.0, MIT Future License for more details. You should have received a
 * copy of the Fair Core License, Version 1.0, MIT Future License along with this program. If not, please write to:
 * hello@resnovas.com, see the official website https://fcl.dev/ or review the GitHub repository
 * https://github.com/keygen-sh/fcl.dev/
 *
 * This project abides the Resnovas Cooperation Commitment. Adapted from the GPL Cooperation Commitment (GPLCC). Before filing
 * or continuing to prosecute any legal proceeding or claim (other than a Defensive Action) arising from termination of a Covered
 * License, we commit to adhering to the Resnovas Cooperation Commitment. You should have received a copy of the Resnovas
 * Cooperation Commitment along with this program. If not, please write to: hello@resnovas.com, or see
 * https://github.com/Resnovas/openclaw-proton-pass/blob/main/COOPERATION_COMMITMENT.md
 *
 * DELETING THIS NOTICE AUTOMATICALLY VOIDS YOUR LICENSE
 */

import { FileSystem } from "@effect/platform"
import { Paths } from "@resnovas/opp-config"
import { Telemetry } from "@resnovas/opp-telemetry"
import { Effect } from "effect"

/** One checked condition and whether it holds. */
export interface Check {
  readonly label: string
  readonly ok: boolean
  readonly detail?: string
}

/**
 * Render checks as aligned terminal lines.
 *
 * @param checks - the checks to display
 * @returns one line per check
 */
export const renderChecks = (checks: ReadonlyArray<Check>): ReadonlyArray<string> =>
  checks.map((check) => {
    const mark = check.ok ? "ok  " : "MISS"
    return check.detail === undefined
      ? `  ${mark}  ${check.label}`
      : `  ${mark}  ${check.label} — ${check.detail}`
  })

/**
 * Report what is installed, what is configured, and what is missing.
 *
 * Read-only: it never creates or repairs anything, so it is safe to run against
 * a production host to find out why resolution is failing.
 */
export const doctor = Effect.gen(function* () {
  const paths = yield* Paths
  const fs = yield* FileSystem.FileSystem
  const telemetry = yield* Telemetry

  const present = (path: string) =>
    fs.exists(path).pipe(Effect.orElseSucceed(() => false))

  const checks: Array<Check> = [
    { label: `pass-cli at ${paths.passCli}`, ok: yield* present(paths.passCli) },
    { label: `secret map ${paths.secretMap}`, ok: yield* present(paths.secretMap) },
    {
      label: `agent token ${paths.agentPat}`,
      ok: yield* present(paths.agentPat),
      detail:
        "create with: pass-cli agent create openclaw-gateway --expiration 1y --vault OpenClaw"
    },
    { label: `proxy routes ${paths.proxyConfig}`, ok: yield* present(paths.proxyConfig) },
    { label: `session directory ${paths.sessionDir}`, ok: yield* present(paths.sessionDir) }
  ]

  for (const line of renderChecks(checks)) {
    yield* Effect.logInfo(line)
  }

  const failed = checks.filter((check) => !check.ok).length
  if (failed > 0) {
    yield* Effect.logWarning(`${failed} check(s) need attention`)
    yield* telemetry.diagnostic("cli.check_failed", "warn", failed)
  }
  // Counts only: which check failed is shape, the paths in its label are not.
  yield* telemetry.capture({
    name: "doctor_report",
    passed: checks.length - failed,
    failed
  })
  return checks
}).pipe((self) => Effect.flatMap(Telemetry, (t) => t.span("cli.doctor", self)))
