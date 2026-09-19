/*
 * Project: openclaw-proton-pass
 * File: logs.ts
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
 * Structured logs over OTLP, carrying ids rather than messages.
 *
 * This project's log lines routinely contain filesystem paths, so the record
 * body is an id drawn from a closed list instead of rendered text.
 *
 * @module
 * @since 0.1.0
 */

import type { LogId, LogLevel } from "./events.js"

/** OpenTelemetry severity numbers for the levels this system emits. */
const SEVERITY: Record<LogLevel, { number: number; text: string }> = {
  debug: { number: 5, text: "DEBUG" },
  info: { number: 9, text: "INFO" },
  warn: { number: 13, text: "WARN" },
  error: { number: 17, text: "ERROR" }
}

/**
 * A log record ready for OTLP transport.
 *
 * @category models
 * @since 0.1.0
 */
export interface LogRecord {
  readonly logId: LogId
  readonly level: LogLevel
  readonly count: number
}

/**
 * Identity of the reporting install, attached to every record.
 *
 * @category models
 * @since 0.1.0
 */
export interface LogResource {
  readonly serviceName: string
  readonly serviceVersion: string
  readonly environment: string
  readonly installId: string
  readonly os: string
  readonly nodeVersion: string
}

const attribute = (key: string, value: string | number) => ({
  key,
  value:
    typeof value === "number" ? { intValue: String(Math.round(value)) } : { stringValue: value }
})

/**
 * Build an OTLP/JSON payload for PostHog's log ingestion.
 *
 * The record body is the log id, never a rendered message. This system's log
 * lines routinely contain filesystem paths, so transmitting message text would
 * undo the guarantee the rest of the pipeline provides; an id from a closed
 * list carries the same diagnostic meaning and cannot carry anything else.
 *
 * @remarks
 * Pure and total: no I/O and no failure mode. Every record's body is its
 * `logId`, so no free text enters the payload. The return type is
 * `unknown` because this is a transport shape rather than a domain value.
 *
 * @param records - the diagnostics to send
 * @param resource - identity of the reporting install
 * @returns the OTLP body to POST to `/i/v1/logs`
 *
 * @category constructors
 * @since 0.1.0
 *
 * @example
 * import { toOtlpLogs } from "@resnovas/opp-telemetry"
 *
 * const body = toOtlpLogs(
 *   [{ logId: "session.probe_failed", level: "info", count: 1 }],
 *   {
 *     serviceName: "openclaw-proton-pass",
 *     serviceVersion: "0.1.0",
 *     environment: "production",
 *     installId: "an-install-identifier",
 *     os: "linux",
 *     nodeVersion: "v22.0.0"
 *   }
 * ) as {
 *   resourceLogs: ReadonlyArray<{
 *     scopeLogs: ReadonlyArray<{
 *       logRecords: ReadonlyArray<{ body: { stringValue: string }; severityText: string }>
 *     }>
 *   }>
 * }
 *
 * const record = body.resourceLogs[0]!.scopeLogs[0]!.logRecords[0]!
 *
 * // The body is the log id, never a rendered message.
 * assert.strictEqual(record.body.stringValue, "session.probe_failed")
 * assert.strictEqual(record.severityText, "INFO")
 */
export const toOtlpLogs = (
  records: ReadonlyArray<LogRecord>,
  resource: LogResource
): unknown => ({
  resourceLogs: [
    {
      resource: {
        attributes: [
          attribute("service.name", resource.serviceName),
          attribute("service.version", resource.serviceVersion),
          attribute("deployment.environment", resource.environment),
          attribute("service.instance.id", resource.installId),
          attribute("os.type", resource.os),
          attribute("process.runtime.version", resource.nodeVersion)
        ]
      },
      scopeLogs: [
        {
          scope: { name: "openclaw-proton-pass" },
          logRecords: records.map((record) => {
            const severity = SEVERITY[record.level]
            return {
              timeUnixNano: String(Date.now() * 1_000_000),
              severityNumber: severity.number,
              severityText: severity.text,
              body: { stringValue: record.logId },
              attributes: [
                attribute("log.id", record.logId),
                attribute("log.count", record.count),
                // PostHog joins a log to a person through a log attribute, not
                // through the resource. Without this the record is correctly
                // identified by install but never appears against the person,
                // which is exactly how it looked: events on the person, logs
                // nowhere near it.
                attribute("posthogDistinctId", resource.installId)
              ]
            }
          })
        }
      ]
    }
  ]
})

/**
 * Send log records to PostHog.
 *
 * Fire and forget: a logging backend that is slow or unreachable must never
 * delay or fail a credential resolution, so the result is discarded either way.
 *
 * @remarks
 * Resolves and never rejects: transport failures are swallowed, because
 * reporting must not be able to fail a credential resolution. Returns
 * immediately when `records` is empty.
 *
 * @param host - the PostHog ingestion host
 * @param projectKey - the project's write-only ingestion key
 * @param records - the diagnostics to send
 * @param resource - identity of the reporting install
 *
 * @category transport
 *
 * @since 0.1.0
 *
 * @example
 * import { sendLogs } from "@resnovas/opp-telemetry"
 *
 * // Nothing is sent for an empty batch, and the call resolves either way: a
 * // logging backend must never be able to fail a credential resolution.
 * await sendLogs("https://example.invalid", "phc_not_a_real_key", [], {
 *   serviceName: "openclaw-proton-pass",
 *   serviceVersion: "0.1.0",
 *   environment: "test",
 *   installId: "an-install-identifier",
 *   os: "linux",
 *   nodeVersion: "v22.0.0"
 * })
 */
export const sendLogs = async (
  host: string,
  projectKey: string,
  records: ReadonlyArray<LogRecord>,
  resource: LogResource
): Promise<void> => {
  if (records.length === 0) return
  try {
    await fetch(`${host.replace(/\/$/, "")}/i/v1/logs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${projectKey}`
      },
      body: JSON.stringify(toOtlpLogs(records, resource))
    })
  } catch {
    // Reporting failures are not the caller's problem.
  }
}
