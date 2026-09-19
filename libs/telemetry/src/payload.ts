/*
 * Project: openclaw-proton-pass
 * File: payload.ts
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
 * The two filters every reported property passes through.
 *
 * A value allowlist is the guarantee - a string is sent only if it appears
 * verbatim in the literals this codebase declares - and a name denylist sits
 * behind it as defence in depth.
 *
 * @module
 * @since 0.1.0
 */

import { ALLOWED_VALUES, type TelemetryEvent } from "./events.js"

/**
 * Field names that could plausibly describe content rather than shape.
 *
 * This is the second of two filters, kept as defence in depth. The value
 * allowlist is the real guarantee; this catches the case where a future literal
 * is added to the allowlist that should not also be acceptable under a
 * suspicious name. A name-based filter alone would be weak, but behind a value
 * allowlist it costs nothing and removes a class of future mistake.
 */
const FORBIDDEN = /secret|token|password|key|ref|path|host|upstream|url|value/i

/**
 * Remove properties whose names suggest they carry content rather than shape.
 *
 * @remarks
 * Pure and total, and returns a new object - the input is not mutated.
 * Filters on the property **name** only, which makes it the weaker of the
 * two filters and not the guarantee on its own; it sits behind the value
 * allowlist in `toProperties` as defence in depth.
 *
 * @param properties - candidate event properties
 * @returns the subset safe to transmit
 *
 * @category utils
 * @since 0.1.0
 *
 * @example
 * import { scrub } from "@resnovas/opp-telemetry"
 *
 * // Shape passes through untouched.
 * assert.deepStrictEqual(scrub({ requested: 3, durationMs: 41 }), {
 *   requested: 3,
 *   durationMs: 41
 * })
 *
 * // Anything named as though it described content is dropped, whatever it
 * // actually holds.
 * assert.deepStrictEqual(scrub({ apiKey: "anything", upstream: "anything" }), {})
 */
export const scrub = (
  properties: Readonly<Record<string, SafeValue>>
): Record<string, SafeValue> => {
  const safe: Record<string, SafeValue> = {}
  for (const [key, value] of Object.entries(properties)) {
    if (!FORBIDDEN.test(key)) safe[key] = value
  }
  return safe
}

/**
 * The only value types that may appear on the wire.
 *
 * @category models
 * @since 0.1.0
 */
export type SafeValue = number | boolean | string

/**
 * Convert an event into the properties sent to the analytics backend.
 *
 * This is the single place a property is ever constructed, and it filters on
 * the **value** rather than the field name. A number or a boolean cannot carry
 * a credential. A string is transmitted only when it appears verbatim in
 * {@link ALLOWED_VALUES}, which contains nothing but literals declared in this
 * codebase.
 *
 * Filtering by value rather than by name matters: a name-based denylist can
 * only block the names someone thought of, and is defeated the moment a secret
 * is placed under an innocuous key. A value allowlist has the opposite failure
 * mode - an unanticipated field is dropped rather than leaked.
 *
 * @remarks
 * Pure and total. The only function that constructs a property object,
 * and therefore the only path to the analytics client. Filters on the
 * **value**: finite numbers and booleans pass, a string passes only if it
 * appears verbatim in `ALLOWED_VALUES`, and everything else is dropped
 * silently. `name` identifies the event and never becomes a property.
 *
 * @param event - a member of the closed event union
 * @returns the properties safe to transmit
 *
 * @category utils
 * @since 0.1.0
 *
 * @example
 * import { toProperties } from "@resnovas/opp-telemetry"
 *
 * // Counts, durations and declared literals survive.
 * assert.deepStrictEqual(
 *   toProperties({ name: "session_established", sessionOutcome: "reused", durationMs: 8 }),
 *   { sessionOutcome: "reused", durationMs: 8 }
 * )
 *
 * // The event name identifies the event; it is not also a property.
 * assert.strictEqual(
 *   "name" in toProperties({ name: "proxy_started", routes: 2 }),
 *   false
 * )
 *
 * @example
 * import { toProperties } from "@resnovas/opp-telemetry"
 *
 * // The guarantee, demonstrated: a string that is not a literal declared in
 * // this codebase is dropped, however it got there. The cast is what a
 * // JavaScript caller or a future refactor would do by accident; the filter
 * // is what makes that harmless.
 * const smuggled = { name: "proxy_started", routes: "a-value-from-a-vault" } as unknown
 *
 * assert.deepStrictEqual(toProperties(smuggled as never), {})
 */
export const toProperties = (event: TelemetryEvent): Record<string, SafeValue> => {
  const properties: Record<string, SafeValue> = {}

  for (const [key, value] of Object.entries(event)) {
    if (key === "name") continue

    if (typeof value === "number") {
      // NaN and Infinity are not transmittable JSON and signal a bug upstream.
      if (Number.isFinite(value)) properties[key] = value
      continue
    }
    if (typeof value === "boolean") {
      properties[key] = value
      continue
    }
    if (typeof value === "string" && ALLOWED_VALUES.has(value)) {
      properties[key] = value
      continue
    }
    // Anything else - an arbitrary string, an object, a nested structure - is
    // dropped. Silently: a caller that reached here has already failed the
    // type check, and refusing to send is the safe outcome.
  }

  // Second filter: the value allowlist above is the guarantee, this is the
  // belt behind the braces.
  return scrub(properties)
}

/**
 * Reduce a stack trace to file names, line numbers and function names.
 *
 * Stack traces are worth having for diagnosis, but an absolute path names the
 * operator's home directory and their install layout. Reducing each frame to a
 * basename keeps every diagnostically useful part - which function, which file,
 * which line - and discards the part that identifies the machine.
 *
 * @remarks
 * Pure and total; `undefined` in, `undefined` out. Reduces every absolute
 * path to its basename, keeping the function, file and line that locate
 * the fault and discarding the part that locates the operator.
 *
 * @param stack - a raw `Error.stack`, if there is one
 * @returns the stack with absolute paths reduced to basenames
 *
 * @category utils
 * @since 0.1.0
 *
 * @example
 * import { sanitiseStack } from "@resnovas/opp-telemetry"
 *
 * assert.strictEqual(
 *   sanitiseStack("SessionError\n    at ensure (/home/someone/.local/lib/session.mjs:12:9)"),
 *   "SessionError\n    at ensure (session.mjs:12:9)"
 * )
 *
 * // Which function, which file and which line all survive; which machine
 * // does not.
 * assert.strictEqual(sanitiseStack(undefined), undefined)
 */
export const sanitiseStack = (stack: string | undefined): string | undefined => {
  if (stack === undefined) return undefined
  return stack.replace(/(?:[A-Za-z]:)?(?:\/|\\)[^\s()]*(?:\/|\\)([^\s()/\\]+)/g, "$1")
}

/**
 * Build the error object sent to error tracking.
 *
 * The original error is never forwarded. Domain errors carry fields such as the
 * path of an unreadable secret map, and an error message is free text, so only
 * the tag - a compile-time constant - becomes the message. The stack is kept
 * because it locates the fault, and is sanitised because it also locates the
 * operator.
 *
 * @remarks
 * Pure and total. The returned error's `message` and `name` are the tag
 * alone; the original error is never forwarded, because a domain error's
 * message is free text and routinely names a file on disk.
 *
 * @param tag - the error's tag
 * @param stack - the original stack, if available
 * @returns an error carrying the tag and a sanitised stack
 *
 * @category utils
 * @since 0.1.0
 *
 * @example
 * import { toReportableError } from "@resnovas/opp-telemetry"
 *
 * const reported = toReportableError(
 *   "SecretMapError",
 *   "SecretMapError: cannot read /home/someone/.config/proton-pass-cli/map.json"
 * )
 *
 * // The message is the tag alone, because a domain error's own message names
 * // the file it failed on.
 * assert.strictEqual(reported.message, "SecretMapError")
 * assert.strictEqual(reported.name, "SecretMapError")
 * assert.strictEqual(reported.stack, "SecretMapError: cannot read map.json")
 */
export const toReportableError = (tag: string, stack?: string): Error => {
  const error = new Error(tag)
  error.name = tag
  const sanitised = sanitiseStack(stack)
  if (sanitised !== undefined) error.stack = sanitised
  return error
}
