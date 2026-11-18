/*
 * Project: openclaw-proton-pass
 * File: secret-ref.ts
 * Last Modified: 2026-09-20
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
 * Parse `op://` secret reference URIs used by the 1Password CLI.
 *
 * A reference names a vault, item, and field without holding a secret value.
 * Parsing happens at the boundary so a resolved credential cannot be passed
 * where a reference is expected.
 *
 * @module
 * @since 0.1.0
 */

import { Data, Effect, Schema } from "effect"

const OP_SCHEME = "op://"

/**
 * Field metadata query values supported on secret references.
 *
 * @category schemas
 * @since 0.1.0
 */
export const OpFieldAttribute = Schema.Literal("otp")

/**
 * The decoded form of {@link OpFieldAttribute}.
 *
 * @category models
 * @since 0.1.0
 */
export type OpFieldAttribute = typeof OpFieldAttribute.Type

/**
 * SSH private-key output formats supported on secret references.
 *
 * @category schemas
 * @since 0.1.0
 */
export const OpSshFormat = Schema.Literal("openssh")

/**
 * The decoded form of {@link OpSshFormat}.
 *
 * @category models
 * @since 0.1.0
 */
export type OpSshFormat = typeof OpSshFormat.Type

/**
 * The components of a validated `op://` secret reference.
 *
 * @category schemas
 * @since 0.1.0
 *
 * @example
 * import { OpSecretRef } from "@resnovas/opp-onepassword-contract"
 * import { Schema } from "effect"
 *
 * const ref = Schema.decodeUnknownSync(OpSecretRef)({
 *   vault: "Private",
 *   item: "db",
 *   field: "password"
 * })
 *
 * assert.strictEqual(ref.field, "password")
 */
export const OpSecretRef = Schema.Struct({
  vault: Schema.String.pipe(Schema.minLength(1)),
  item: Schema.String.pipe(Schema.minLength(1)),
  section: Schema.optional(Schema.String.pipe(Schema.minLength(1))),
  field: Schema.String.pipe(Schema.minLength(1)),
  attribute: Schema.optional(OpFieldAttribute),
  sshFormat: Schema.optional(OpSshFormat)
}).pipe(Schema.brand("OpSecretRef"))

/**
 * The decoded form of {@link OpSecretRef}, branded so a bare object cannot
 * stand in for a parsed reference.
 *
 * @category models
 * @since 0.1.0
 */
export type OpSecretRef = typeof OpSecretRef.Type

/**
 * Raised when an `op://` URI cannot be parsed into an {@link OpSecretRef}.
 *
 * @category errors
 * @since 0.1.0
 */
export class OpSecretRefParseError extends Data.TaggedError("OpSecretRefParseError")<{
  readonly uri: string
  readonly reason: string
}> {}

const decodeSegment = (segment: string): Effect.Effect<string, OpSecretRefParseError, never> => {
  try {
    const decoded = decodeURIComponent(segment)
    if (decoded.length === 0) {
      return Effect.fail(
        new OpSecretRefParseError({ uri: segment, reason: "path segments must not be empty" })
      )
    }
    return Effect.succeed(decoded)
  } catch {
    return Effect.fail(
      new OpSecretRefParseError({
        uri: segment,
        reason: "path segment is not valid URI encoding"
      })
    )
  }
}

const parseAttribute = (
  uri: string,
  raw: string | null
): Effect.Effect<OpFieldAttribute | undefined, OpSecretRefParseError> => {
  if (raw === null) return Effect.succeed(undefined)
  if (raw === "otp") return Effect.succeed("otp")
  return Effect.fail(
    new OpSecretRefParseError({
      uri,
      reason: `unsupported attribute query parameter: ${raw}`
    })
  )
}

const parseSshFormat = (
  uri: string,
  raw: string | null
): Effect.Effect<OpSshFormat | undefined, OpSecretRefParseError> => {
  if (raw === null) return Effect.succeed(undefined)
  if (raw === "openssh") return Effect.succeed("openssh")
  return Effect.fail(
    new OpSecretRefParseError({
      uri,
      reason: `unsupported ssh-format query parameter: ${raw}`
    })
  )
}

/**
 * Parse a 1Password secret reference URI into its components.
 *
 * @remarks
 * Accepts `op://vault/item/field`, `op://vault/item/section/field`, and the
 * query parameters `attribute=otp` (or `attr=otp`) and `ssh-format=openssh`.
 * Percent-encoded path segments are decoded. Any other scheme, path shape, or
 * query value fails with {@link OpSecretRefParseError}. Pure: no I/O.
 *
 * @param uri - the secret reference to parse
 * @returns the branded reference components
 *
 * @category utils
 * @since 0.1.0
 *
 * @example
 * import { parseOpSecretRef } from "@resnovas/opp-onepassword-contract"
 * import { Effect } from "effect"
 *
 * const bare = Effect.runSync(parseOpSecretRef("op://Private/db/password"))
 * assert.strictEqual(bare.vault, "Private")
 * assert.strictEqual(bare.item, "db")
 * assert.strictEqual(bare.field, "password")
 *
 * const sectioned = Effect.runSync(
 *   parseOpSecretRef("op://Private/ssh%20keys/ssh%20key/private%20key?ssh-format=openssh")
 * )
 * assert.strictEqual(sectioned.section, "ssh key")
 * assert.strictEqual(sectioned.sshFormat, "openssh")
 *
 * const otp = Effect.runSync(
 *   parseOpSecretRef("op://development/GitHub/Security/one-time password?attribute=otp")
 * )
 * assert.strictEqual(otp.attribute, "otp")
 */
export const parseOpSecretRef = (
  uri: string
): Effect.Effect<OpSecretRef, OpSecretRefParseError> =>
  Effect.gen(function* () {
    if (!uri.startsWith(OP_SCHEME)) {
      return yield* Effect.fail(
        new OpSecretRefParseError({
          uri,
          reason: "secret references must start with op://"
        })
      )
    }

    const rest = uri.slice(OP_SCHEME.length)
    const queryIndex = rest.indexOf("?")
    const pathPart = queryIndex === -1 ? rest : rest.slice(0, queryIndex)
    const queryPart = queryIndex === -1 ? "" : rest.slice(queryIndex + 1)

    const rawSegments = pathPart.split("/")
    if (rawSegments.length !== 3 && rawSegments.length !== 4) {
      return yield* Effect.fail(
        new OpSecretRefParseError({
          uri,
          reason: "expected op://vault/item/field or op://vault/item/section/field"
        })
      )
    }

    const segments = yield* Effect.forEach(rawSegments, (segment) =>
      decodeSegment(segment).pipe(
        Effect.mapError(
          (error) => new OpSecretRefParseError({ uri, reason: error.reason })
        )
      )
    )

    const params = new URLSearchParams(queryPart)
    const attribute = yield* parseAttribute(
      uri,
      params.get("attribute") ?? params.get("attr")
    )
    const sshFormat = yield* parseSshFormat(uri, params.get("ssh-format"))

    const vault = segments[0]!
    const item = segments[1]!
    const third = segments[2]!
    const fourth = segments[3]

    const parsed =
      fourth === undefined
        ? {
            vault,
            item,
            field: third
          }
        : {
            vault,
            item,
            section: third,
            field: fourth
          }

    return yield* decodeParsedOpSecretRef(uri, {
      ...parsed,
      ...(attribute === undefined ? {} : { attribute }),
      ...(sshFormat === undefined ? {} : { sshFormat })
    })
  })

/**
 * Validate parsed reference components against {@link OpSecretRef}.
 *
 * @remarks
 * Separated from {@link parseOpSecretRef} so schema failures can be exercised
 * without constructing a URI that would fail earlier in path parsing.
 *
 * @param uri - original URI for error reporting
 * @param parsed - decoded path and query components
 * @returns the branded reference
 *
 * @category utils
 * @since 0.1.0
 *
 * @example
 * import { decodeParsedOpSecretRef } from "@resnovas/opp-onepassword-contract"
 * import { Effect } from "effect"
 *
 * const ref = Effect.runSync(
 *   decodeParsedOpSecretRef("op://Private/db/password", {
 *     vault: "Private",
 *     item: "db",
 *     field: "password"
 *   })
 * )
 * assert.strictEqual(ref.field, "password")
 */
export const decodeParsedOpSecretRef = (
  uri: string,
  parsed: {
    readonly vault: string
    readonly item: string
    readonly field: string
    readonly section?: string
    readonly attribute?: OpFieldAttribute
    readonly sshFormat?: OpSshFormat
  }
): Effect.Effect<OpSecretRef, OpSecretRefParseError> =>
  Schema.decodeUnknown(OpSecretRef)(parsed).pipe(
    Effect.mapError(
      (error) =>
        new OpSecretRefParseError({
          uri,
          reason: error.message
        })
    )
  )
