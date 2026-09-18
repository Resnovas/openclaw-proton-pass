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
 * @param properties - candidate event properties
 * @returns the subset safe to transmit
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

/** The only value types that may appear on the wire. */
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
 * mode — an unanticipated field is dropped rather than leaked.
 *
 * @param event - a member of the closed event union
 * @returns the properties safe to transmit
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
    // Anything else — an arbitrary string, an object, a nested structure — is
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
 * basename keeps every diagnostically useful part — which function, which file,
 * which line — and discards the part that identifies the machine.
 *
 * @param stack - a raw `Error.stack`, if there is one
 * @returns the stack with absolute paths reduced to basenames
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
 * the tag — a compile-time constant — becomes the message. The stack is kept
 * because it locates the fault, and is sanitised because it also locates the
 * operator.
 *
 * @param tag - the error's tag
 * @param stack - the original stack, if available
 * @returns an error carrying the tag and a sanitised stack
 */
export const toReportableError = (tag: string, stack?: string): Error => {
  const error = new Error(tag)
  error.name = tag
  const sanitised = sanitiseStack(stack)
  if (sanitised !== undefined) error.stack = sanitised
  return error
}
