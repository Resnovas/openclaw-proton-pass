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
 * The management CLI's command tree.
 *
 * `setup` and `doctor`, defined with `@effect/cli`. Each subcommand is timed
 * and its name and outcome reported - never its arguments.
 *
 * @module
 * @since 0.1.0
 */


import { Command as Cli } from "@effect/cli"
import { NodeContext } from "@effect/platform-node"
import { Paths, StderrLoggerLive } from "@resnovas/opp-config"
import { PassSession, SecretResolver } from "@resnovas/opp-pass-cli"
import { Telemetry, type CommandName } from "@resnovas/opp-telemetry"
import { Clock, Effect, Layer } from "effect"
import { doctor } from "./doctor.js"
import { setup } from "./setup.js"

/** Time a subcommand and report its name and outcome - never its arguments. */
const instrumented = <A, E, R>(command: CommandName, effect: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const telemetry = yield* Telemetry
    const started = yield* Clock.currentTimeMillis
    const exit = yield* Effect.exit(effect)
    yield* telemetry.capture({
      name: "command_run",
      command,
      outcome: exit._tag === "Success" ? "success" : "failure",
      durationMs: (yield* Clock.currentTimeMillis) - started
    })
    yield* telemetry.flush
    return yield* exit
  })

const doctorCommand = Cli.make("doctor", {}, () =>
  instrumented("doctor", doctor.pipe(Effect.asVoid))
)
const setupCommand = Cli.make("setup", {}, () => instrumented("setup", setup))

const root = Cli.make("openclaw-proton-pass", {}, () =>
  Effect.logInfo("run `openclaw-proton-pass --help` to see the available commands")
).pipe(Cli.withSubcommands([doctorCommand, setupCommand]))

/**
 * Run the CLI.
 *
 * @remarks
 * Parses `process.argv` and dispatches to a subcommand. Requires the
 * services in `layer`. Exits non-zero when a subcommand fails.
 *
 * @category entrypoints
 * @since 0.1.0
 *
 * @param args - the full `process.argv`
 * @returns an Effect that completes when the subcommand has
 *
 * @example
 * import { run } from "@resnovas/opp-cli/app"
 * import { Effect } from "effect"
 *
 * // `run` is the parser, not the process: it yields an Effect, so nothing has
 * // happened until it is executed against the app's layer.
 * assert.strictEqual(Effect.isEffect(run(["node", "openclaw-proton-pass", "--help"])), true)
 */
export const run = Cli.run(root, {
  name: "openclaw-proton-pass",
  version: "0.1.0"
})

/**
 * Everything the CLI's subcommands need in order to run.
 *
 * @category entrypoints
 * @since 0.1.0
 */
export const layer = Layer.mergeAll(
  SecretResolver.Default,
  PassSession.Default,
  Paths.Default,
  Telemetry.Default
).pipe(Layer.provideMerge(NodeContext.layer), Layer.merge(StderrLoggerLive))
