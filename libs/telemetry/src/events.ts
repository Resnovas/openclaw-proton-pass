/*
 * Project: openclaw-proton-pass
 * File: events.ts
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
 * The closed set of events this system can report, and the closed set of string
 * values they may carry.
 *
 * No event has a field of type `string`, so a secret has no field to travel
 * in. This is the whole safety argument, stated as types.
 *
 * @module
 * @since 0.1.0
 */

/**
 * Every event this system is capable of reporting.
 *
 * The union is closed and its fields are deliberately restricted to three
 * shapes: numbers, booleans, and strings drawn from literal types declared in
 * this file. There is no field anywhere of type `string`.
 *
 * That restriction is the whole safety argument. A secret is a runtime string
 * of unknown content; if no event has a field that accepts an arbitrary string,
 * then no secret has anywhere to go. Diagnostics are therefore expressed as
 * counts, durations, flags and tags - which is also what makes them aggregable.
 */

/**
 * Which executable produced the event.
 *
 * @category models
 * @since 0.1.0
 */
export type Binary = "resolver" | "pass-run" | "mcp-auth-proxy" | "cli" | "opp-op"

/**
 * Subcommands of the management CLI.
 *
 * @category models
 * @since 0.1.0
 */
export type CommandName = "setup" | "doctor" | "token" | "help"

/**
 * The tag of a domain error. Tags are compile-time constants, never content.
 *
 * @category models
 * @since 0.1.0
 */
export type ErrorTag =
  | "SecretMapError"
  | "MissingAgentTokenError"
  | "SessionError"
  | "ResolutionError"
  | "ProtocolError"
  | "RouteConfigError"
  | "ProxyIoError"
  | "Unknown"

/**
 * Coarse result of an operation.
 *
 * @category models
 * @since 0.1.0
 */
export type Outcome = "success" | "failure"

/**
 * Why a session bootstrap did what it did.
 *
 * @category models
 * @since 0.1.0
 */
export type SessionPath = "reused" | "logged-in" | "rebuilt"

/**
 * Structured log records, identified rather than written out.
 *
 * A human log line is free text and this project's log lines routinely contain
 * filesystem paths, so log *messages* are never transmitted. Each diagnostic
 * worth aggregating gets an id here instead, and the id travels with counts.
 *
 * @category models
 * @since 0.1.0
 */
export type LogId =
  | "session.probe_failed"
  | "session.login_failed"
  | "session.directory_rebuilt"
  | "resolver.map_unreadable"
  | "resolver.id_not_in_map"
  | "resolver.empty_value"
  | "proxy.route_not_found"
  | "proxy.credential_refreshed"
  | "proxy.upstream_unreachable"
  | "proxy.relay_interrupted"
  | "cli.config_seeded"
  | "cli.check_failed"
  | "cli.token_stored"

/**
 * Spans this system records.
 *
 * Span names are constants for the same reason event fields are: a span name
 * is transmitted, so it must not be derived from anything at runtime.
 *
 * @category models
 * @since 0.1.0
 */
export type SpanName =
  | "resolver.handle_request"
  | "resolver.load_map"
  | "resolver.resolve_refs"
  | "session.ensure"
  | "proxy.handle_request"
  | "proxy.forward"
  | "proxy.relay"
  | "cli.setup"
  | "cli.doctor"
  | "cli.token"

/**
 * Severity for a structured log record.
 *
 * @category models
 * @since 0.1.0
 */
export type LogLevel = "debug" | "info" | "warn" | "error"

/**
 * The events themselves.
 *
 * `name` is the PostHog event name; every other field becomes a property.
 *
 * @category models
 * @since 0.1.0
 */
export type TelemetryEvent =
  /** Product analytics: which binary ran at all, and on what shape of host. */
  | {
      readonly name: "binary_started"
      readonly binary: Binary
      readonly nodeMajor: number
      readonly installedAsPlugin: boolean
    }
  /** The provider answered the Gateway. The headline metric. */
  | {
      readonly name: "provider_resolved"
      readonly requested: number
      readonly resolved: number
      readonly missing: number
      readonly decorated: number
      readonly durationMs: number
      readonly sessionOutcome: SessionPath
    }
  /** The provider could produce nothing. */
  | {
      readonly name: "provider_failed"
      readonly requested: number
      readonly errorTag: ErrorTag
      readonly durationMs: number
    }
  /** A vault session was established, and what it cost. */
  | {
      readonly name: "session_established"
      readonly sessionOutcome: SessionPath
      readonly durationMs: number
    }
  /** A stdio MCP server was launched through the wrapper. */
  | {
      readonly name: "mcp_server_launched"
      readonly outcome: Outcome
      readonly exitCode: number
      readonly durationMs: number
    }
  /** The proxy bound its listener. */
  | {
      readonly name: "proxy_started"
      readonly routes: number
    }
  /** One proxied request completed. */
  | {
      readonly name: "proxy_request"
      readonly status: number
      readonly durationMs: number
      readonly credentialRetried: boolean
      readonly outcome: Outcome
    }
  /** A management command ran. */
  | {
      readonly name: "command_run"
      readonly command: CommandName
      readonly outcome: Outcome
      readonly durationMs: number
    }
  /** `doctor` reported on a host, as a count of passes and failures. */
  | {
      readonly name: "doctor_report"
      readonly passed: number
      readonly failed: number
    }
  /**
   * One completed span.
   *
   * Tracing is reported through the same guarded channel as everything else
   * rather than through a separate exporter. An OpenTelemetry exporter would
   * serialise whatever attributes a span happens to carry, which reintroduces
   * exactly the unguarded path this design exists to remove.
   */
  | {
      readonly name: "span_completed"
      readonly span: SpanName
      readonly durationMs: number
      readonly outcome: Outcome
    }
  /** A structured diagnostic, identified rather than written out. */
  | {
      readonly name: "diagnostic"
      readonly logId: LogId
      readonly level: LogLevel
      readonly count: number
    }

/**
 * The name of any member of {@link TelemetryEvent}: the closed list of events
 * this system is able to send.
 *
 * @category models
 * @since 0.1.0
 */
export type EventName = TelemetryEvent["name"]

/**
 * Every string value any event field is permitted to carry.
 *
 * This is the runtime half of the compile-time guarantee. The type system stops
 * a TypeScript caller assigning a secret to a field; this set stops anything
 * else - a JavaScript caller, a future refactor, a mistake - because a value is
 * transmitted only if it appears here verbatim. Membership is tested against
 * the value, not the field name, so it cannot be defeated by choosing an
 * innocuous-looking key.
 *
 * @category constants
 * @since 0.1.0
 *
 * @example
 * import { ALLOWED_VALUES } from "@resnovas/opp-telemetry"
 *
 * // Every permitted string is a literal written in this codebase.
 * assert.strictEqual(ALLOWED_VALUES.has("reused"), true)
 * assert.strictEqual(ALLOWED_VALUES.has("SecretMapError"), true)
 *
 * // A value read from a vault is not one of them, and never can be.
 * assert.strictEqual(ALLOWED_VALUES.has("a-value-from-a-vault"), false)
 */
export const ALLOWED_VALUES: ReadonlySet<string> = new Set<string>([
  // Binary
  "resolver",
  "pass-run",
  "mcp-auth-proxy",
  "cli",
  // CommandName
  "setup",
  "doctor",
  "token",
  "help",
  // ErrorTag
  "SecretMapError",
  "MissingAgentTokenError",
  "SessionError",
  "ResolutionError",
  "ProtocolError",
  "RouteConfigError",
  "ProxyIoError",
  "Unknown",
  // Outcome
  "success",
  "failure",
  // SessionPath
  "reused",
  "logged-in",
  "rebuilt",
  // LogId
  "session.probe_failed",
  "session.login_failed",
  "session.directory_rebuilt",
  "resolver.map_unreadable",
  "resolver.id_not_in_map",
  "resolver.empty_value",
  "proxy.route_not_found",
  "proxy.credential_refreshed",
  "proxy.upstream_unreachable",
  "proxy.relay_interrupted",
  "cli.config_seeded",
  "cli.check_failed",
  "cli.token_stored",
  // SpanName
  "resolver.handle_request",
  "resolver.load_map",
  "resolver.resolve_refs",
  "session.ensure",
  "proxy.handle_request",
  "proxy.forward",
  "proxy.relay",
  "cli.setup",
  "cli.doctor",
  "cli.token",
  // LogLevel
  "debug",
  "info",
  "warn",
  "error"
])
