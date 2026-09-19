/*
 * Project: openclaw-proton-pass
 * File: telemetry.ts
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
 * The service the rest of the system reports through.
 *
 * One interface whether or not reporting is enabled, so no call site has to
 * know which it is.
 *
 * @module
 * @since 0.1.0
 */

import {
  Paths,
  telemetryEnabled,
  telemetryEnvironment,
  telemetryHost,
  telemetryProjectKey,
  telemetryServiceName
} from "@resnovas/opp-config"
import { Clock, Effect, Option, Redacted } from "effect"
import { PostHog } from "posthog-node"
import { deviceContext, installId, type DeviceContext } from "./device.js"
import type { ErrorTag, LogId, LogLevel, Outcome, SpanName, TelemetryEvent } from "./events.js"
import { sendLogs, type LogResource } from "./logs.js"
import { toProperties, toReportableError } from "./payload.js"

/**
 * What the telemetry service offers, whether or not reporting is enabled.
 *
 * @category models
 * @since 0.1.0
 */
export interface TelemetryApi {
  /** Report one analytics event, and its numeric fields as metrics. */
  readonly capture: (event: TelemetryEvent) => Effect.Effect<void>
  /** Report a failure to error tracking, by tag. */
  readonly captureError: (tag: ErrorTag, stack?: string) => Effect.Effect<void>
  /** Report a structured diagnostic to logs. */
  readonly diagnostic: (
    logId: LogId,
    level: LogLevel,
    count?: number
  ) => Effect.Effect<void>
  /** Record an effect as a distributed-tracing span. */
  readonly span: <A, E, R>(
    name: SpanName,
    effect: Effect.Effect<A, E, R>
  ) => Effect.Effect<A, E, R>
  /** Flush anything buffered. */
  readonly flush: Effect.Effect<void>
  /** Whether reporting is actually on. */
  readonly active: boolean
}

/**
 * Device fields sent as person properties.
 *
 * Free-form strings are acceptable here, unlike in event properties, because
 * each is read from `node:os`, `process`, or a version command. None is derived
 * from a secret, a vault reference, or anything an operator typed, so the
 * reason the event allowlist exists does not apply to them.
 */
const personProperties = (device: DeviceContext): Record<string, string | number | boolean> => ({
  hostname: device.hostname,
  os: device.os,
  os_release: device.osRelease,
  arch: device.arch,
  node_version: device.nodeVersion,
  npm_version: device.npmVersion,
  pnpm_version: device.pnpmVersion,
  pass_cli_version: device.passCliVersion,
  cpu_count: device.cpuCount,
  memory_gb: device.memoryGb,
  timezone: device.timezone,
  is_ci: device.isCi,
  installed_as_plugin: device.installedAsPlugin,
  app_version: device.appVersion
})

/**
 * Usage reporting: analytics, metrics, logs, traces and error tracking.
 *
 * On by default. The reporting pipeline is built so that a secret has no field
 * to travel in, which is what makes that defensible for a tool handling
 * credentials - see TELEMETRY.md. Opting out is one environment variable.
 *
 * Each signal goes to the PostHog product that displays it: analytics and
 * errors as events, metrics through the SDK's metrics client, spans through its
 * tracing client, and diagnostics as OTLP log records. Event properties still
 * pass through {@link toProperties}, the single place a property is built.
 *
 * @category services
 * @since 0.1.0
 */
export class Telemetry extends Effect.Service<Telemetry>()("Telemetry", {
  effect: Effect.gen(function* () {
    const enabled = yield* telemetryEnabled
    const key = yield* telemetryProjectKey
    const host = yield* telemetryHost
    const serviceName = yield* telemetryServiceName
    const environment = yield* telemetryEnvironment

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

    const identity = yield* installId
    const device = yield* deviceContext
    const projectKey = Redacted.value(key.value)

    const client = new PostHog(projectKey, {
      host,
      // Turning these on is what routes spans and measurements to the Tracing
      // and Metrics products rather than leaving them as ordinary events.
      traces: { serviceName, serviceVersion: device.appVersion, environment },
      metrics: { serviceName, serviceVersion: device.appVersion, environment }
    })

    const resource: LogResource = {
      serviceName,
      serviceVersion: device.appVersion,
      environment,
      installId: identity,
      os: device.os,
      nodeVersion: device.nodeVersion
    }

    // Identify the install once, so every later event joins to a person
    // carrying the machine's description.
    client.identify({ distinctId: identity, properties: personProperties(device) })

    /** Send one event, plus its numeric fields as metric series. */
    const send = (event: TelemetryEvent) =>
      Effect.sync(() => {
        const properties = toProperties(event)
        client.capture({ distinctId: identity, event: event.name, properties })

        // The same numbers, as metrics, so they are chartable as series rather
        // than only queryable as events.
        for (const [field, value] of Object.entries(properties)) {
          if (typeof value !== "number") continue
          const metric = `openclaw_proton_pass.${event.name}.${field}`
          if (field === "durationMs") {
            client.metrics.histogram(metric, value, { unit: "ms" })
          } else {
            client.metrics.count(metric, value)
          }
        }
        client.metrics.count(`openclaw_proton_pass.${event.name}.total`, 1)
      }).pipe(Effect.ignore)

    const live: TelemetryApi = {
      capture: send,
      captureError: (tag, stack) =>
        Effect.sync(() => {
          // The original error never travels: its message is free text and its
          // fields may hold a path. Only the tag and a sanitised stack do.
          //
          // The fingerprint is pinned to the tag rather than derived. PostHog
          // builds one from the resolved in-app stack frames, and the frames
          // reaching it here have had their paths reduced to basenames, so the
          // same failure could group differently between builds. The tag
          // already names the failure mode exactly, which is the grouping this
          // system wants: one issue per way of failing.
          client.captureException(toReportableError(tag, stack), identity, {
            errorTag: tag,
            $exception_fingerprint: tag
          })
          client.metrics.count(`openclaw_proton_pass.error.${tag}`, 1)
        }).pipe(Effect.ignore),
      diagnostic: (logId, level, count = 1) =>
        Effect.promise(() => sendLogs(host, projectKey, [{ logId, level, count }], resource)).pipe(
          Effect.zipRight(send({ name: "diagnostic", logId, level, count })),
          Effect.ignore
        ),
      span: timedSpan((name, durationMs, outcome) =>
        Effect.sync(() => {
          // A real span, so it appears in the Tracing product with its timing
          // and outcome rather than only as an event row.
          const span = client.startSpan(name, {
            attributes: {
              outcome,
              "service.name": serviceName,
              // The SDK fills a span's person from its own request context,
              // which a CLI never has, so the identity is set as an attribute.
              posthogDistinctId: identity
            }
          })
          span.end()
          client.metrics.histogram(`openclaw_proton_pass.span.${name}`, durationMs, {
            unit: "ms",
            attributes: { outcome }
          })
        }).pipe(
          Effect.ignore,
          Effect.zipRight(send({ name: "span_completed", span: name, durationMs, outcome }))
        )
      ),
      flush: Effect.promise(() => client.shutdown()).pipe(Effect.ignore),
      active: true
    }
    return live
  }),
  // Telemetry reads the install id and device profile from the config
  // directory, so it owns that dependency rather than making every caller
  // remember to provide it.
  dependencies: [Paths.Default]
}) {}
