/*
 * Project: openclaw-proton-pass
 * File: 20_resolve-a-secret.ts
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
 * @title Resolving a secret
 *
 * `SecretResolver` is the only thing that talks to the vault. It answers with
 * one outcome per requested id, in request order.
 */
import { SecretResolver } from "@resnovas/opp-pass-cli"
import { SecretId } from "@resnovas/opp-domain"
import { Effect, Redacted, Schema } from "effect"

const decodeId = Schema.decodeUnknownSync(SecretId)

export const example = Effect.gen(function* () {
  const resolver = yield* SecretResolver

  // One call resolves the whole batch. Resolution costs a `pass-cli`
  // invocation, so asking for several ids at once is meaningfully cheaper
  // than a call each.
  // The second argument is not optional. It becomes the reason recorded
  // against this read in the vault's audit log, and a read with no reason is
  // refused by an agent token, so there is no call that does not have to say
  // what it is for.
  const outcomes = yield* resolver.resolve(
    [decodeId("CONTEXT7_API_KEY"), decodeId("NOT_IN_THE_MAP")],
    { binary: "resolver" }
  )

  for (const [id, outcome] of outcomes) {
    if (outcome._tag === "NotFound") {
      // An unknown id and an empty vault field are reported identically, so
      // the provider cannot be used to discover which ids exist.
      yield* Effect.logWarning(`no value for ${id}`)
      continue
    }

    // `outcome.value` is `Redacted<string>`. Logging it prints `<redacted>`,
    // which is the point: only the boundary that needs the value unwraps it.
    yield* Effect.logInfo(`resolved ${id}: ${outcome.value}`)

    // Unwrap only where the value is genuinely required. In the resolver that
    // is the protocol response; in the proxy it is the outbound header.
    const _value: string = Redacted.value(outcome.value)
    void _value
  }
}).pipe(Effect.provide(SecretResolver.Default))
