/*
 * Project: openclaw-proton-pass
 * File: resolver.ts
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
import {
  decorate,
  normaliseEntry,
  ResolutionError,
  SecretMap,
  SecretMapError,
  type PassRef,
  type SecretId
} from "@resnovas/opp-domain"
import { Effect, Redacted, Schema, Stream } from "effect"
import { PassSession } from "./session.js"

/** The outcome for one requested id: a value, or the reason there is none. */
export type Resolved =
  | { readonly _tag: "Value"; readonly value: Redacted.Redacted<string> }
  | { readonly _tag: "NotFound" }

/**
 * Resolves opaque secret ids to their values via Proton Pass.
 *
 * Values are carried as {@link Redacted} from the moment they leave pass-cli,
 * so a stray log line or error message cannot print one. Unwrapping is explicit
 * and happens only where the value is genuinely needed: the protocol response
 * on stdout, or the outbound HTTP header.
 */
export class SecretResolver extends Effect.Service<SecretResolver>()("SecretResolver", {
  effect: Effect.gen(function* () {
    const paths = yield* Paths
    const timeoutMillis = yield* commandTimeoutMillis
    const fs = yield* FileSystem.FileSystem
    const session = yield* PassSession
    const decodeMap = Schema.decodeUnknown(SecretMap)

    /** Read and validate the secret map. */
    const loadMap = Effect.gen(function* () {
      const raw = yield* fs.readFileString(paths.secretMap).pipe(
        Effect.mapError(
          (cause) => new SecretMapError({ path: paths.secretMap, reason: String(cause) })
        )
      )
      const parsed = yield* Effect.try({
        try: () => JSON.parse(raw) as unknown,
        catch: (cause) =>
          new SecretMapError({ path: paths.secretMap, reason: `invalid JSON: ${cause}` })
      })
      return yield* decodeMap(parsed).pipe(
        Effect.mapError(
          (cause) => new SecretMapError({ path: paths.secretMap, reason: String(cause) })
        )
      )
    })

    /**
     * Resolve ordered references in a single pass-cli call.
     *
     * `pass-cli run` substitutes any environment variable whose value is a
     * `pass://` URI, so one invocation covers every requested reference rather
     * than paying a vault round trip each. `--no-masking` is required because
     * the point is to emit the values; that output is consumed here and never
     * reaches a terminal or a log.
     */
    const resolveRefs = (refs: ReadonlyArray<PassRef>) =>
      Effect.gen(function* () {
        const names = refs.map((_, index) => `OPENCLAW_SECRET_${index}`)
        const env = Object.fromEntries(names.map((name, index) => [name, refs[index]!]))
        const script = `printf "%s\\0" ${names.map((name) => `"$${name}"`).join(" ")}`

        // stdout and the exit code are both needed, and `Command.string`
        // discards the code — it resolves with whatever was written even when
        // the process failed, which would turn a vault error into a silent
        // batch of empty values.
        const output = yield* Effect.scoped(
          Effect.gen(function* () {
            const process = yield* Command.make(
              paths.passCli,
              "run",
              "--no-masking",
              "--",
              "bash",
              "-c",
              script
            ).pipe(Command.env({ ...session.baseEnv, ...env }), Command.start)

            const text = yield* process.stdout.pipe(Stream.decodeText(), Stream.mkString)
            const code = yield* process.exitCode
            if (code !== 0) {
              return yield* new ResolutionError({ reason: `pass-cli run exited ${code}` })
            }
            return text
          })
        ).pipe(
          Effect.timeout(timeoutMillis),
          Effect.mapError((cause) =>
            cause instanceof ResolutionError
              ? cause
              : new ResolutionError({ reason: String(cause) })
          )
        )

        // printf emits a trailing NUL after the last value, so drop the empty tail.
        const parts = output.split("\0")
        if (parts.length > 0 && parts[parts.length - 1] === "") parts.pop()
        return parts.map((part) => Redacted.make(part))
      })

    /**
     * Resolve every requested id.
     *
     * An id absent from the map, or one whose reference resolves to nothing,
     * comes back as `NotFound` rather than failing the batch: one bad id must
     * not deny the Gateway every other secret it asked for.
     *
     * @param ids - the ids the Gateway asked for
     * @returns one outcome per requested id, in request order
     */
    const resolve = (ids: ReadonlyArray<SecretId>) =>
      Effect.gen(function* () {
        const outcomes = new Map<SecretId, Resolved>()
        if (ids.length === 0) return outcomes

        const map = yield* loadMap
        const known = ids.filter((id) => Object.hasOwn(map, id))
        for (const id of ids) {
          if (!known.includes(id)) outcomes.set(id, { _tag: "NotFound" })
        }
        if (known.length === 0) return outcomes

        yield* session.ensure
        const entries = known.map((id) => map[id]!)
        const values = yield* resolveRefs(
          entries.map((entry) => normaliseEntry(entry).ref)
        )

        known.forEach((id, index) => {
          const raw = values[index]
          const entry = entries[index]!
          // An unresolved reference comes back empty rather than failing.
          if (raw === undefined || Redacted.value(raw) === "") {
            outcomes.set(id, { _tag: "NotFound" })
            return
          }
          outcomes.set(id, {
            _tag: "Value",
            value: Redacted.make(decorate(entry, Redacted.value(raw)))
          })
        })

        return outcomes
      })

    return { resolve, loadMap } as const
  }),
  dependencies: [Paths.Default, PassSession.Default]
}) {}
