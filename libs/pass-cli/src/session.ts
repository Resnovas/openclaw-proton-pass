/*
 * Project: openclaw-proton-pass
 * File: session.ts
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

import { Command, FileSystem } from "@effect/platform"
import { commandTimeoutMillis, Paths } from "@resnovas/opp-config"
import { MissingAgentTokenError, SessionError } from "@resnovas/opp-domain"
import { Telemetry, type SessionPath } from "@resnovas/opp-telemetry"
import { Clock, Effect, Redacted } from "effect"

/**
 * A pass-cli session scoped to this provider alone.
 *
 * pass-cli keeps one session per directory, so this service deliberately uses
 * its own `PROTON_PASS_SESSION_DIR`: sharing the default would mean the Gateway
 * and the operator's terminal continually logged each other out.
 *
 * Authentication uses a dedicated agent token rather than a user session,
 * because the Gateway starts at boot, long before any terminal has logged in.
 */
export class PassSession extends Effect.Service<PassSession>()("PassSession", {
  effect: Effect.gen(function* () {
    const paths = yield* Paths
    const timeoutMillis = yield* commandTimeoutMillis
    const telemetry = yield* Telemetry
    const fs = yield* FileSystem.FileSystem

    const baseEnv = {
      PROTON_PASS_SESSION_DIR: paths.sessionDir,
      // Agent tokens refuse audited reads unless a reason is given, so every
      // read this provider performs stays attributable in `pass-cli agent
      // monitor`.
      PROTON_PASS_AGENT_REASON: "OpenClaw Gateway secret resolution"
    } as const

    /**
     * Run one pass-cli subcommand and report whether it succeeded.
     *
     * The exit code is the only reliable signal here: `Command.string` resolves
     * with whatever the process wrote to stdout even when it exited non-zero,
     * so a probe built on it would report every broken session as healthy and
     * the login path would never run.
     */
    const succeeds = (args: ReadonlyArray<string>, extraEnv: Record<string, string> = {}) =>
      Command.make(paths.passCli, ...args).pipe(
        Command.env({ ...baseEnv, ...extraEnv }),
        Command.exitCode,
        Effect.timeout(timeoutMillis),
        Effect.map((code) => code === 0),
        Effect.orElseSucceed(() => false)
      )

    /** True when the existing session can still be used. */
    const probe = succeeds(["info"])

    const readToken = Effect.gen(function* () {
      const exists = yield* fs
        .exists(paths.agentPat)
        .pipe(Effect.orElseSucceed(() => false))
      if (!exists) {
        return yield* new MissingAgentTokenError({ path: paths.agentPat })
      }
      const contents = yield* fs.readFileString(paths.agentPat).pipe(
        Effect.mapError(
          (cause) => new SessionError({ reason: `could not read agent token: ${cause}` })
        )
      )
      return Redacted.make(contents.trim())
    })

    /**
     * One logout/login cycle.
     *
     * The logout is not optional: `pass-cli login --pat` refuses with "Already
     * authenticated" whenever a session file exists, including a stale one that
     * `info` can no longer read.
     */
    const attemptLogin = (token: Redacted.Redacted<string>) =>
      Effect.gen(function* () {
        yield* succeeds(["logout"])
        return yield* succeeds(["login", "--pat", Redacted.value(token)])
      })

    /**
     * Guarantee a usable session, rebuilding the session directory if needed.
     *
     * pass-cli keeps an encrypted database in the session directory whose key
     * derives from the token. `logout` leaves that database behind, so after
     * the token is rotated it can no longer be decrypted and every login fails
     * with an opaque sqlcipher error. The directory belongs solely to this
     * provider, so the correct repair is simply to rebuild it.
     */
    const ensure = Effect.gen(function* () {
        const started = yield* Clock.currentTimeMillis

        /** Report which of the three paths the bootstrap actually took. */
        const settled = (sessionOutcome: SessionPath) =>
          Effect.gen(function* () {
            const durationMs = (yield* Clock.currentTimeMillis) - started
            yield* telemetry.capture({ name: "session_established", sessionOutcome, durationMs })
            return sessionOutcome
          })

        if (yield* probe) return yield* settled("reused")
        yield* telemetry.diagnostic("session.probe_failed", "info")

        const token = yield* readToken
        if (yield* attemptLogin(token)) return yield* settled("logged-in")
        yield* telemetry.diagnostic("session.login_failed", "warn")

        yield* fs.remove(paths.sessionDir, { recursive: true }).pipe(Effect.ignore)
        yield* fs
          .makeDirectory(paths.sessionDir, { recursive: true })
          .pipe(
            Effect.mapError(
              (cause) =>
                new SessionError({ reason: `could not rebuild session directory: ${cause}` })
            )
          )

        yield* telemetry.diagnostic("session.directory_rebuilt", "warn")
        if (yield* attemptLogin(token)) return yield* settled("rebuilt")
        return yield* new SessionError({
          reason: "agent token login failed after rebuilding the session directory"
        })
      }).pipe((self) => telemetry.span("session.ensure", self))

    return { ensure, baseEnv } as const
  }),
  dependencies: [Paths.Default, Telemetry.Default]
}) {}
