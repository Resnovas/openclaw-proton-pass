/*
 * Project: openclaw-proton-pass
 * File: 10_add-an-event.ts
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
 * @title Reporting an event
 *
 * Every field is a number, a boolean, or a string literal declared in the
 * event union. There is no field of type `string`, so a secret has nowhere to
 * go — this is the safety property, expressed as a type rather than a policy.
 */
import { Telemetry } from "@resnovas/opp-telemetry"
import { Effect } from "effect"

export const example = Effect.gen(function* () {
  const telemetry = yield* Telemetry

  // Counts and durations. `sessionOutcome` is one of three literals, so it
  // describes what happened without describing anything that happened *to*.
  yield* telemetry.capture({
    name: "provider_resolved",
    requested: 2,
    resolved: 1,
    missing: 1,
    decorated: 0,
    durationMs: 41,
    sessionOutcome: "reused"
  })

  // A diagnostic is an id from a fixed list plus a count. Log *messages* are
  // never transmitted, because this project's log lines routinely contain
  // filesystem paths.
  yield* telemetry.diagnostic("resolver.id_not_in_map", "warn")

  // A failure travels as its tag. The error itself is not forwarded: its
  // fields carry paths and its message is free text.
  yield* telemetry.captureError("SecretMapError")

  // Short-lived processes must flush, or the buffer is discarded on exit and
  // nothing is ever reported.
  yield* telemetry.flush
}).pipe(Effect.provide(Telemetry.Default))
