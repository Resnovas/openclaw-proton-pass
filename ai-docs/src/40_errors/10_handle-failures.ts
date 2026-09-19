/*
 * Project: openclaw-proton-pass
 * File: 10_handle-failures.ts
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
 * @title Handling failure
 *
 * Every failure is a tagged member of one exhaustive union, so a handler can
 * match without a default branch and adding a member is a compiler-enforced
 * change at every handling site.
 */
import { SecretId } from "@resnovas/opp-domain"
import { SecretResolver, type Resolved } from "@resnovas/opp-pass-cli"
import { Effect, Schema } from "effect"

const decodeId = Schema.decodeUnknownSync(SecretId)

/** Nothing resolved, because the vault could not be asked. */
const nothing = new Map<SecretId, Resolved>()

export const example = Effect.gen(function* () {
  const resolver = yield* SecretResolver

  // The compiler knows exactly which of the seven failures `resolve` can
  // produce, so handling one it cannot produce is a type error rather than
  // dead code nobody notices. `loadMap` fails only with `SecretMapError`;
  // adding the other three tags to it would not compile.
  return yield* resolver.resolve([decodeId("CONTEXT7_API_KEY")]).pipe(
    // Each tag names the file to look at, because the error carries the path
    // rather than leaving an operator to guess between three of them.
    Effect.catchTag("SecretMapError", (cause) =>
      Effect.logError(`${cause.path}: ${cause.reason}`).pipe(Effect.as(nothing))
    ),
    Effect.catchTag("MissingAgentTokenError", (cause) =>
      Effect.logError(`no agent token at ${cause.path}`).pipe(Effect.as(nothing))
    ),
    Effect.catchTag("SessionError", (cause) =>
      Effect.logError(`no vault session: ${cause.reason}`).pipe(Effect.as(nothing))
    ),
    Effect.catchTag("ResolutionError", (cause) =>
      Effect.logError(`the vault call failed: ${cause.reason}`).pipe(Effect.as(nothing))
    )
  )
}).pipe(Effect.provide(SecretResolver.Default))
