/*
 * Project: openclaw-proton-pass
 * File: telemetry.ts
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

import { telemetryEnabled, telemetryHost, telemetryProjectKey } from "@resnovas/opp-config"
import { Effect, Option, Redacted } from "effect"
import { PostHog } from "posthog-node"

/** An event this system is willing to report. */
export interface TelemetryEvent {
  readonly name: string
  /**
   * Properties must describe shape, never content: counts, durations, error
   * tags. Anything derived from a secret, a vault path or a hostname is not
   * permitted here, and {@link scrub} drops what slips through.
   */
  readonly properties?: Readonly<Record<string, string | number | boolean>>
}

/** Keys that could carry identifying or sensitive content. */
const FORBIDDEN = /secret|token|password|key|ref|path|host|upstream|url|value/i

/**
 * Remove properties whose names suggest they carry content rather than shape.
 *
 * A denylist on names is crude, but it fails safe: a property that should have
 * been sent is merely absent, whereas the alternative failure mode is shipping
 * a customer's vault path to an analytics service.
 *
 * @param properties - candidate event properties
 * @returns the subset safe to transmit
 */
export const scrub = (
  properties: Readonly<Record<string, string | number | boolean>>
): Record<string, string | number | boolean> => {
  const safe: Record<string, string | number | boolean> = {}
  for (const [key, value] of Object.entries(properties)) {
    if (!FORBIDDEN.test(key)) safe[key] = value
  }
  return safe
}

/** What the telemetry service offers, whether or not reporting is enabled. */
export interface TelemetryApi {
  readonly capture: (event: TelemetryEvent) => Effect.Effect<void>
  readonly flush: Effect.Effect<void>
  readonly active: boolean
}

/**
 * Usage reporting, off unless explicitly enabled.
 *
 * This tool handles other people's credentials, so telemetry is opt-in:
 * `OPENCLAW_PROTONPASS_TELEMETRY=true` plus a project key. With either absent
 * the service is a no-op that still type-checks at every call site, so callers
 * never branch on whether reporting is configured.
 */
export class Telemetry extends Effect.Service<Telemetry>()("Telemetry", {
  effect: Effect.gen(function* () {
    const enabled = yield* telemetryEnabled
    const key = yield* telemetryProjectKey
    const host = yield* telemetryHost

    if (!enabled || Option.isNone(key)) {
      const inert: TelemetryApi = {
        capture: () => Effect.void,
        flush: Effect.void,
        active: false
      }
      return inert
    }

    const client = new PostHog(Redacted.value(key.value), { host })

    const live: TelemetryApi = {
      capture: (event: TelemetryEvent) =>
        Effect.sync(() => {
          client.capture({
            distinctId: "openclaw-proton-pass",
            event: event.name,
            properties: event.properties ? scrub(event.properties) : {}
          })
          // A failure to report must never fail the operation being reported.
        }).pipe(Effect.ignore),
      flush: Effect.promise(() => client.shutdown()).pipe(Effect.ignore),
      active: true
    }
    return live
  })
}) {}
