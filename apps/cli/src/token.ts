/*
 * Project: openclaw-proton-pass
 * File: token.ts
 * Last Modified: 2026-09-19
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
 * Storing the Proton Pass agent token.
 *
 * The token arrives on standard input and is written to the configured path
 * with owner-only permissions. This exists as a command because the shell
 * one-liner it replaces was not portable: `install -m 0600 /dev/stdin` has no
 * Windows equivalent, and the here-string that fed it is a bash and zsh
 * feature that fish and POSIX sh do not have.
 *
 * @module
 * @since 0.1.0
 */

import { CommandExecutor, FileSystem } from "@effect/platform"
import { Paths, restrictToOwner } from "@resnovas/opp-config"
import { MissingAgentTokenError } from "@resnovas/opp-domain"
import { Telemetry } from "@resnovas/opp-telemetry"
import { Effect, Redacted } from "effect"

/**
 * Read standard input to the end, as text.
 *
 * The token is piped in and the writer closes, so this reads to EOF rather
 * than a line at a time. A read that fails yields the empty string, which the
 * caller already treats as nothing having been supplied: there is no useful
 * distinction between an unreadable pipe and an empty one.
 */
const readStdin = Effect.tryPromise({
  try: async () => {
    const chunks: Array<Buffer> = []
    for await (const chunk of process.stdin) {
      chunks.push(chunk as Buffer)
    }
    return Buffer.concat(chunks).toString("utf8")
  },
  catch: () => new Error("unreadable")
}).pipe(Effect.orElseSucceed(() => ""))

/**
 * Reduce piped input to the token it carries.
 *
 * @remarks
 * Pure and total. Trims the surrounding whitespace a pipe adds, which matters
 * because a trailing newline is invisible in a terminal and pass-cli rejects
 * the token with an authentication error rather than a parse error, sending
 * the reader looking in the wrong place. Input holding more than one line is
 * rejected rather than silently truncated: it means something other than a
 * token was piped in.
 *
 * @param input - everything read from standard input
 * @returns the token, or `undefined` when the input does not hold exactly one
 *
 * @example
 * import { parseToken } from "@resnovas/opp-cli/token"
 *
 * assert.strictEqual(parseToken("  pat_abc123\n"), "pat_abc123")
 * assert.strictEqual(parseToken("\n\n"), undefined)
 * assert.strictEqual(parseToken("one\ntwo"), undefined)
 */
export const parseToken = (input: string): string | undefined => {
  const trimmed = input.trim()
  if (trimmed === "") return undefined
  return trimmed.includes("\n") ? undefined : trimmed
}

/**
 * Store the agent token piped in on standard input.
 *
 * @remarks
 * Fails with `MissingAgentTokenError` when nothing usable was piped in,
 * naming the path the token would have been written to. An existing token is
 * replaced, because rotating one is the reason to run this a second time. The
 * value is held as `Redacted` from the moment it is parsed, so it cannot
 * reach a log line by accident, and it is never reported to telemetry in any
 * form.
 *
 * @returns an Effect that completes once the token is on disk
 *
 * @example
 * import { storeToken } from "@resnovas/opp-cli/token"
 * import { Effect } from "effect"
 *
 * // Nothing has been read or written yet: the command is an Effect, so it
 * // touches standard input only when it is run.
 * assert.strictEqual(Effect.isEffect(storeToken), true)
 */
export const storeToken: Effect.Effect<
  void,
  MissingAgentTokenError,
  Paths | Telemetry | FileSystem.FileSystem | CommandExecutor.CommandExecutor
> = Effect.gen(function* () {
  const paths = yield* Paths
  const fs = yield* FileSystem.FileSystem
  const telemetry = yield* Telemetry

  const token = parseToken(yield* readStdin)
  if (token === undefined) {
    yield* Effect.logError(
      "no token on standard input - pipe one in, for example:" +
        "\n  pass-cli agent create openclaw-gateway --expiration 1y --vault OpenClaw" +
        "\n  openclaw-proton-pass token < token.txt"
    )
    return yield* new MissingAgentTokenError({ path: paths.agentPat })
  }
  const redacted = Redacted.make(token)

  yield* fs.makeDirectory(paths.configDir, { recursive: true }).pipe(Effect.orDie)
  yield* restrictToOwner(paths.platform, paths.configDir, "directory")
  yield* fs
    .writeFileString(paths.agentPat, `${Redacted.value(redacted)}\n`)
    .pipe(Effect.orDie)
  yield* restrictToOwner(paths.platform, paths.agentPat, "file")

  yield* telemetry.diagnostic("cli.token_stored", "info")
  yield* Effect.logInfo(`agent token stored at ${paths.agentPat}`)
  yield* Effect.logInfo("check it with: openclaw-proton-pass doctor")
}).pipe((self) => Effect.flatMap(Telemetry, (t) => t.span("cli.token", self)))
