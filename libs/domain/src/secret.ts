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

import { Schema } from "effect"

/**
 * An opaque name for a secret, as written in `openclaw.json` and the secret map.
 *
 * Ids are deliberately not vault paths: the map is the only place a vault
 * location is recorded, so moving an item between vaults is a one-file edit
 * rather than a configuration migration.
 */
export const SecretId = Schema.String.pipe(
  Schema.minLength(1),
  Schema.brand("SecretId")
)

/** @see {@link SecretId} */
export type SecretId = typeof SecretId.Type

/**
 * A `pass://` reference to a field of an item in a Proton Pass vault.
 *
 * Branded and validated at the boundary so a plain string holding a literal
 * secret cannot be passed where a reference is expected.
 */
export const PassRef = Schema.String.pipe(
  Schema.startsWith("pass://"),
  Schema.brand("PassRef")
)

/** @see {@link PassRef} */
export type PassRef = typeof PassRef.Type

/**
 * A reference plus the decoration its consumer needs around the resolved value.
 *
 * This form exists because one secret resolves to exactly one value, while an
 * HTTP `Authorization` header needs a scheme in front of the token. Decorating
 * at resolution keeps a single copy of the secret in the vault instead of a
 * second field that must be rotated in lockstep with the first.
 */
export const DecoratedSecret = Schema.Struct({
  ref: PassRef,
  prefix: Schema.optionalWith(Schema.String, { default: () => "" }),
  suffix: Schema.optionalWith(Schema.String, { default: () => "" })
})

/** @see {@link DecoratedSecret} */
export type DecoratedSecret = typeof DecoratedSecret.Type

/** A map entry: either a bare reference, or one carrying decoration. */
export const SecretMapEntry = Schema.Union(PassRef, DecoratedSecret)

/** @see {@link SecretMapEntry} */
export type SecretMapEntry = typeof SecretMapEntry.Type

/** The whole secret map: opaque id to reference. */
export const SecretMap = Schema.Record({
  key: SecretId,
  value: SecretMapEntry
})

/** @see {@link SecretMap} */
export type SecretMap = typeof SecretMap.Type

/**
 * Normalise a map entry to its reference and decoration.
 *
 * Both entry shapes are reduced to one so callers never branch on which form
 * the operator happened to write.
 *
 * @param entry - a bare reference or a decorated one
 * @returns the reference with the prefix and suffix to wrap the resolved value
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
 * @param entry - the map entry the value was resolved from
 * @param value - the raw value returned by pass-cli
 * @returns the value the consumer should receive
 */
export const decorate = (entry: SecretMapEntry, value: string): string => {
  const parts = normaliseEntry(entry)
  return `${parts.prefix}${value}${parts.suffix}`
}
