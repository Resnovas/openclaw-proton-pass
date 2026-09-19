/*
 * Project: openclaw-proton-pass
 * File: secret.ts
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
 * The names and references this system uses to talk about a secret without
 * ever holding one.
 *
 * An id is an opaque label; a reference is a location in a vault. Both are
 * branded, so neither can be confused with the other or with a resolved
 * value.
 *
 * @module
 * @since 0.1.0
 */

import { Schema } from "effect"

/**
 * An opaque name for a secret, as written in `openclaw.json` and the secret map.
 *
 * Ids are deliberately not vault paths: the map is the only place a vault
 * location is recorded, so moving an item between vaults is a one-file edit
 * rather than a configuration migration.
 *
 * @category schemas
 * @since 0.1.0
 *
 * @example
 * import { SecretId } from "@resnovas/opp-domain"
 * import { Schema } from "effect"
 *
 * const decode = Schema.decodeUnknownSync(SecretId)
 *
 * assert.strictEqual(decode("CONTEXT7_API_KEY"), "CONTEXT7_API_KEY")
 *
 * // An id names an entry in the map, so an empty name refers to nothing.
 * assert.throws(() => decode(""))
 */
export const SecretId = Schema.String.pipe(
  Schema.minLength(1),
  Schema.brand("SecretId")
)

/**
 * The type of a validated {@link SecretId}, branded so a bare string cannot
 * stand in for one.
 *
 * @category models
 * @since 0.1.0
 */
export type SecretId = typeof SecretId.Type

/**
 * A `pass://` reference to a field of an item in a Proton Pass vault.
 *
 * Branded and validated at the boundary so a plain string holding a literal
 * secret cannot be passed where a reference is expected.
 *
 * @category schemas
 * @since 0.1.0
 *
 * @example
 * import { PassRef } from "@resnovas/opp-domain"
 * import { Schema } from "effect"
 *
 * const decode = Schema.decodeUnknownSync(PassRef)
 *
 * assert.strictEqual(
 *   decode("pass://OpenClaw/context7.com/API Key"),
 *   "pass://OpenClaw/context7.com/API Key"
 * )
 *
 * // Anything that is not a reference is refused, which is what stops a
 * // resolved value being written back into the map by mistake.
 * assert.throws(() => decode("not-a-reference"))
 */
export const PassRef = Schema.String.pipe(
  Schema.startsWith("pass://"),
  Schema.brand("PassRef")
)

/**
 * The type of a validated {@link PassRef}: a location in a vault, never a
 * value read out of one.
 *
 * @category models
 * @since 0.1.0
 */
export type PassRef = typeof PassRef.Type

/**
 * A reference plus the decoration its consumer needs around the resolved value.
 *
 * This form exists because one secret resolves to exactly one value, while an
 * HTTP `Authorization` header needs a scheme in front of the token. Decorating
 * at resolution keeps a single copy of the secret in the vault instead of a
 * second field that must be rotated in lockstep with the first.
 *
 * @category schemas
 * @since 0.1.0
 */
export const DecoratedSecret = Schema.Struct({
  ref: PassRef,
  prefix: Schema.optionalWith(Schema.String, { default: () => "" }),
  suffix: Schema.optionalWith(Schema.String, { default: () => "" })
})

/**
 * The decoded form of {@link DecoratedSecret}, with `prefix` and `suffix`
 * filled in from their defaults when the operator omitted them.
 *
 * @category models
 * @since 0.1.0
 */
export type DecoratedSecret = typeof DecoratedSecret.Type

/**
 * A map entry: either a bare reference, or one carrying decoration.
 *
 * @category schemas
 * @since 0.1.0
 */
export const SecretMapEntry = Schema.Union(PassRef, DecoratedSecret)

/**
 * The decoded form of {@link SecretMapEntry}: either shape an operator may
 * write for one id.
 *
 * @category models
 * @since 0.1.0
 */
export type SecretMapEntry = typeof SecretMapEntry.Type

/**
 * The whole secret map: opaque id to reference.
 *
 * @category schemas
 * @since 0.1.0
 *
 * @example
 * import { SecretMap } from "@resnovas/opp-domain"
 * import { Schema } from "effect"
 *
 * const map = Schema.decodeUnknownSync(SecretMap)({
 *   CONTEXT7_API_KEY: "pass://OpenClaw/context7.com/API Key",
 *   CONTEXT7_MCP_AUTHORIZATION: {
 *     ref: "pass://OpenClaw/context7.com/API Key",
 *     prefix: "Bearer "
 *   }
 * })
 *
 * assert.deepStrictEqual(Object.keys(map), [
 *   "CONTEXT7_API_KEY",
 *   "CONTEXT7_MCP_AUTHORIZATION"
 * ])
 */
export const SecretMap = Schema.Record({
  key: SecretId,
  value: SecretMapEntry
})

/**
 * The decoded form of {@link SecretMap}: every id this install can resolve,
 * and where each one lives.
 *
 * @category models
 * @since 0.1.0
 */
export type SecretMap = typeof SecretMap.Type

/**
 * Normalise a map entry to its reference and decoration.
 *
 * Both entry shapes are reduced to one so callers never branch on which form
 * the operator happened to write.
 *
 * @remarks
 * Total: both entry shapes are accepted and neither is rejected. A bare
 * reference yields empty `prefix` and `suffix`, so the result shape does
 * not vary with the input shape. Never throws.
 *
 * @param entry - a bare reference or a decorated one
 * @returns the reference with the prefix and suffix to wrap the resolved value
 *
 * @category utils
 * @since 0.1.0
 *
 * @example
 * import { normaliseEntry, PassRef } from "@resnovas/opp-domain"
 * import { Schema } from "effect"
 *
 * const ref = Schema.decodeUnknownSync(PassRef)("pass://OpenClaw/context7.com/API Key")
 *
 * // A bare reference is the same thing as one with empty decoration.
 * assert.deepStrictEqual(normaliseEntry(ref), { ref, prefix: "", suffix: "" })
 * assert.deepStrictEqual(normaliseEntry({ ref, prefix: "Bearer ", suffix: "" }), {
 *   ref,
 *   prefix: "Bearer ",
 *   suffix: ""
 * })
 */
export const normaliseEntry = (
  entry: SecretMapEntry
): { readonly ref: PassRef; readonly prefix: string; readonly suffix: string } =>
  typeof entry === "string"
    ? { ref: entry, prefix: "", suffix: "" }
    : { ref: entry.ref, prefix: entry.prefix, suffix: entry.suffix }

/**
 * Apply an entry's decoration to a resolved value.
 *
 * @remarks
 * Total: every entry shape yields a string. Decoration is applied inside
 * the redacted boundary, so the prefix never exists as a separate value
 * beside the credential. Never throws.
 *
 * @param entry - the map entry the value was resolved from
 * @param value - the raw value returned by pass-cli
 * @returns the value the consumer should receive
 *
 * @category utils
 * @since 0.1.0
 *
 * @example
 * import { decorate, PassRef } from "@resnovas/opp-domain"
 * import { Schema } from "effect"
 *
 * const ref = Schema.decodeUnknownSync(PassRef)("pass://OpenClaw/context7.com/API Key")
 *
 * // The same vault entry serves a bare credential field and an HTTP header,
 * // so the vault holds one copy rather than two that must rotate together.
 * assert.strictEqual(decorate(ref, "from-the-vault"), "from-the-vault")
 * assert.strictEqual(
 *   decorate({ ref, prefix: "Bearer ", suffix: "" }, "from-the-vault"),
 *   "Bearer from-the-vault"
 * )
 */
export const decorate = (entry: SecretMapEntry, value: string): string => {
  const parts = normaliseEntry(entry)
  return `${parts.prefix}${value}${parts.suffix}`
}
