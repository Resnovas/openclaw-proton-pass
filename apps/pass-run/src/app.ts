/*
 * Project: openclaw-proton-pass
 * File: app.ts
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

/**
 * The stdio MCP wrapper.
 *
 * Bootstraps a vault session, then execs the child with `pass://`
 * environment references resolved. stdio is inherited so the launched
 * server owns the transport directly.
 *
 * @module
 * @since 0.1.0
 */


import { Command } from "@effect/platform"
import { NodeContext } from "@effect/platform-node"
import { Paths, StderrLoggerLive } from "@resnovas/opp-config"
import { PassSession } from "@resnovas/opp-pass-cli"
import { Telemetry } from "@resnovas/opp-telemetry"
import { Clock, Effect, Layer } from "effect"
import { parseArgv } from "./argv.js"

/** Exit codes, following sysexits so a supervisor can tell the cases apart. */
const EX_USAGE = 64
const EX_UNAVAILABLE = 69

const exitWith = (code: number, message: string) =>
  Effect.logError(message).pipe(
    Effect.zipRight(
      Effect.sync(() => {
        process.exitCode = code
      })
    )
  )

/**
 * Launch the child command with its `pass://` references resolved.
 *
 * @remarks
 * Exits `64` when no command was given and `69` when no vault session could
 * be established — sysexits codes, so a supervisor can tell the two apart.
 * Otherwise the child's exit code becomes this process's exit code.
 *
 * @category entrypoints
 * @since 0.1.0
 */
export const main = Effect.gen(function* () {
  const argv = parseArgv(process.argv.slice(2))
  const command = argv[0]
  if (command === undefined) {
    return yield* exitWith(
      EX_USAGE,
      "openclaw-pass-run: no command given\nusage: openclaw-pass-run <command> [args...]"
    )
  }

  const paths = yield* Paths
  const session = yield* PassSession
  const telemetry = yield* Telemetry
  const started = yield* Clock.currentTimeMillis

  // Bootstrapping the session before exec means a credential failure is
  // reported as itself, rather than as the child mysteriously failing later.
  const ready = yield* session.ensure.pipe(Effect.either)
  if (ready._tag === "Left") {
    return yield* exitWith(
      EX_UNAVAILABLE,
      `openclaw-pass-run: could not establish a Proton Pass agent session (${ready.left._tag})\n` +
        `  check: PROTON_PASS_SESSION_DIR=${paths.sessionDir} ${paths.passCli} info`
    )
  }

  // stdio is inherited so the launched MCP server owns the transport directly:
  // OpenClaw manages a stdio server by its pid and its streams, and an extra
  // process in between would break both signal delivery and the protocol.
  const exitCode = yield* Command.make(paths.passCli, "run", "--", ...argv).pipe(
    Command.env({
      ...session.baseEnv,
      PROTON_PASS_AGENT_REASON: `MCP server launch: ${command}`
    }),
    Command.stdin("inherit"),
    Command.stdout("inherit"),
    Command.stderr("inherit"),
    Command.exitCode
  )

  yield* telemetry.capture({
    name: "mcp_server_launched",
    outcome: exitCode === 0 ? "success" : "failure",
    exitCode,
    durationMs: (yield* Clock.currentTimeMillis) - started
  })
  yield* telemetry.flush

  yield* Effect.sync(() => {
    process.exitCode = exitCode
  })
})

/**
 * Everything the wrapper needs in order to run.
 *
 * @category entrypoints
 * @since 0.1.0
 */
export const layer = Layer.mergeAll(PassSession.Default, Paths.Default, Telemetry.Default).pipe(
  Layer.provideMerge(NodeContext.layer),
  Layer.merge(StderrLoggerLive)
)
