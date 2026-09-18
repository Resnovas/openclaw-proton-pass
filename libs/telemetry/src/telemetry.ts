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
import { Clock, Effect, Option, Redacted } from "effect"
import { PostHog } from "posthog-node"
import type { ErrorTag, LogId, LogLevel, Outcome, SpanName, TelemetryEvent } from "./events.js"
import { toProperties, toReportableError } from "./payload.js"

/** What the telemetry service offers, whether or not reporting is enabled. */
export interface TelemetryApi {
  /** Report one analytics or metric event. */
  readonly capture: (event: TelemetryEvent) => Effect.Effect<void>
  /** Report a failure to error tracking, by tag. */
  readonly captureError: (tag: ErrorTag, stack?: string) => Effect.Effect<void>
  /** Report a structured diagnostic. */
  readonly diagnostic: (
    logId: LogId,
    level: LogLevel,
    count?: number
  ) => Effect.Effect<void>
  /**
   * Record an effect as a span: timed, named, and reported with its outcome.
   *
   * Wraps `Effect.withSpan`, so the span also exists in the Effect runtime for
   * anyone attaching a local tracer, while what leaves the process is the
   * guarded summary rather than the span's raw attributes.
   */
  readonly span: <A, E, R>(
    name: SpanName,
    effect: Effect.Effect<A, E, R>
  ) => Effect.Effect<A, E, R>
  /** Flush anything buffered. */
  readonly flush: Effect.Effect<void>
  /** Whether reporting is actually on. */
  readonly active: boolean
}

/** The identity events are attributed to. */
const DISTINCT_ID = "openclaw-proton-pass"

/**
 * Usage reporting, off unless explicitly enabled.
 *
 * Covers product analytics, metrics, structured logs, error tracking and
 * tracing — all through one function, {@link toProperties}, which is the only
 * place a property is built. Adding a capture path without going through it is
 * the one mistake that could leak, so there is deliberately nowhere else to
 * construct an event.
 *
 * Off by default: this tool handles other people's credentials, so reporting is
 * something an operator turns on rather than something they must discover and
 * turn off.
 */
export class Telemetry extends Effect.Service<Telemetry>()("Telemetry", {
  effect: Effect.gen(function* () {
    const enabled = yield* telemetryEnabled
    const key = yield* telemetryProjectKey
    const host = yield* telemetryHost

    /** Time an effect and report it as a span, whatever the service's state. */
    const timedSpan =
      (report: (name: SpanName, durationMs: number, outcome: Outcome) => Effect.Effect<void>) =>
      <A, E, R>(name: SpanName, effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
        Effect.gen(function* () {
          const started = yield* Clock.currentTimeMillis
          const exit = yield* Effect.exit(effect)
          const elapsed = (yield* Clock.currentTimeMillis) - started
          yield* report(name, elapsed, exit._tag === "Success" ? "success" : "failure")
          return yield* exit
        }).pipe(Effect.withSpan(name))

    if (!enabled || Option.isNone(key)) {
      const inert: TelemetryApi = {
        capture: () => Effect.void,
        captureError: () => Effect.void,
        diagnostic: () => Effect.void,
        span: timedSpan(() => Effect.void),
        flush: Effect.void,
        active: false
      }
      return inert
    }

    const client = new PostHog(Redacted.value(key.value), { host })

    /** Hand one event to the client. Reporting must never fail the caller. */
    const send = (event: TelemetryEvent) =>
      Effect.sync(() => {
        client.capture({
          distinctId: DISTINCT_ID,
          event: event.name,
          properties: toProperties(event)
        })
      }).pipe(Effect.ignore)

    const live: TelemetryApi = {
      capture: send,
      captureError: (tag, stack) =>
        Effect.sync(() => {
          // The original error never travels: its message is free text and its
          // fields may hold a path. Only the tag and a sanitised stack do.
          client.captureException(toReportableError(tag, stack), DISTINCT_ID, {
            errorTag: tag
          })
        }).pipe(Effect.ignore),
      diagnostic: (logId, level, count = 1) =>
        send({ name: "diagnostic", logId, level, count }),
      span: timedSpan((name, durationMs, outcome) =>
        send({ name: "span_completed", span: name, durationMs, outcome })
      ),
      flush: Effect.promise(() => client.shutdown()).pipe(Effect.ignore),
      active: true
    }
    return live
  })
}) {}
