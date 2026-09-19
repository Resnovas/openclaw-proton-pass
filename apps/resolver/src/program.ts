/*
 * Project: openclaw-proton-pass
 * File: program.ts
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
 * The resolver's logic, separated from the process it runs in.
 *
 * Kept apart from the entry point so a request can be handled in a test
 * without spawning a process or touching stdin.
 *
 * @module
 * @since 0.1.0
 */

import {
  PROTOCOL_VERSION,
  ProtocolError,
  ResolveRequest,
  type ResolveFailure,
  type ResolveResponse
} from "@resnovas/opp-domain"
import { SecretResolver } from "@resnovas/opp-pass-cli"
import type { ErrorTag } from "@resnovas/opp-telemetry"
import { Telemetry } from "@resnovas/opp-telemetry"
import { Clock, Effect, Redacted, Schema } from "effect"

const decodeRequest = Schema.decodeUnknown(ResolveRequest)

/**
 * Parse a provider request from the Gateway.
 *
 * @param raw - the bytes read from stdin
 * @returns the decoded request
 *
 * @remarks
 * Fails with `ProtocolError` for anything that is not a well-formed request -
 * invalid JSON, a wrong protocol version, or an id that is not a non-empty
 * string. Never throws; the failure is in the Effect.
 *
 * @example
 * import { parseRequest } from "@resnovas/opp-resolver/program"
 * import { Effect, Exit } from "effect"
 *
 * const request = await Effect.runPromise(
 *   parseRequest('{"protocolVersion":1,"ids":["CONTEXT7_API_KEY"]}')
 * )
 *
 * assert.deepStrictEqual(request.ids, ["CONTEXT7_API_KEY"])
 *
 * // Anything malformed fails rather than resolving to a partial request.
 * assert.strictEqual(Exit.isFailure(await Effect.runPromiseExit(parseRequest("{"))), true)
 */
export const parseRequest = (
  raw: string
): Effect.Effect<ResolveRequest, ProtocolError> =>
  Effect.gen(function* () {
    const json = yield* Effect.try({
      try: () => JSON.parse(raw) as unknown,
      catch: (cause) => new ProtocolError({ reason: `could not parse request: ${cause}` })
    })
    return yield* decodeRequest(json).pipe(
      Effect.mapError((cause) => new ProtocolError({ reason: String(cause) }))
    )
  })

/**
 * Resolve a request into the response to write on stdout.
 *
 * Values are unwrapped from {@link Redacted} only here, at the single boundary
 * where the Gateway genuinely needs them.
 *
 * @param request - the decoded provider request
 * @returns the response body
 *
 * @remarks
 * Never fails: a resolution error becomes a response carrying `error`, because
 * the Gateway needs a reply on stdout either way. Requires `SecretResolver` and
 * `Telemetry`. Per-id failures travel in `errors` so one unknown id does not
 * cost the caller the rest of the batch.
 *
 * @example
 * import { handle } from "@resnovas/opp-resolver/program"
 * import { Effect } from "effect"
 *
 * // `handle` describes the work; it needs a resolver and telemetry before it
 * // can run, which is what lets a test drive it without a vault.
 * assert.strictEqual(Effect.isEffect(handle({ protocolVersion: 1, ids: [] })), true)
 */
export const handle = (request: ResolveRequest) =>
  Effect.gen(function* () {
    const resolver = yield* SecretResolver
    const telemetry = yield* Telemetry
    const started = yield* Clock.currentTimeMillis

    // The tag is the only part of a domain error that may be reported: the
    // fields carry paths and the message is free text.
    let failureTag: ErrorTag = "Unknown"
    const outcomes = yield* resolver.resolve(request.ids).pipe(
      Effect.catchAll((cause) =>
        Effect.gen(function* () {
          failureTag = cause._tag
          yield* Effect.logError(`resolution failed: ${cause._tag}`)
          yield* telemetry.captureError(cause._tag, cause.stack)
          return undefined
        })
      )
    )

    if (outcomes === undefined) {
      yield* telemetry.capture({
        name: "provider_failed",
        requested: request.ids.length,
        errorTag: failureTag,
        durationMs: (yield* Clock.currentTimeMillis) - started
      })
      const failure: ResolveResponse = {
        protocolVersion: PROTOCOL_VERSION,
        error: "resolution failed; see stderr for the reason"
      }
      return failure
    }

    const values: Record<string, string> = {}
    const errors: Record<string, ResolveFailure> = {}
    for (const [id, outcome] of outcomes) {
      if (outcome._tag === "Value") values[id] = Redacted.value(outcome.value)
      else errors[id] = "NOT_FOUND"
    }

    yield* telemetry.capture({
      name: "provider_resolved",
      requested: request.ids.length,
      resolved: Object.keys(values).length,
      missing: Object.keys(errors).length,
      decorated: 0,
      durationMs: (yield* Clock.currentTimeMillis) - started,
      sessionOutcome: "reused"
    })

    const response: ResolveResponse =
      Object.keys(errors).length > 0
        ? { protocolVersion: PROTOCOL_VERSION, values, errors }
        : { protocolVersion: PROTOCOL_VERSION, values }
    return response
  })

/**
 * Render a protocol-level failure, where no value could be produced at all.
 *
 * @param reason - what went wrong, safe to show an operator
 *
 * @remarks
 * Pure and total. Used when the request itself could not be understood, so no
 * per-id outcome exists to report.
 *
 * @returns a response carrying only the protocol-level error
 *
 * @example
 * import { protocolFailure } from "@resnovas/opp-resolver/program"
 *
 * assert.deepStrictEqual(protocolFailure("could not parse request"), {
 *   protocolVersion: 1,
 *   error: "could not parse request"
 * })
 */
export const protocolFailure = (reason: string): ResolveResponse => ({
  protocolVersion: PROTOCOL_VERSION,
  error: reason
})
