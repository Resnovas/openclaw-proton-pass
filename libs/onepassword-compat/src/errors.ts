/*
 * Project: openclaw-proton-pass
 * File: errors.ts
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
 * Tagged failures for the 1Password compatibility layer.
 *
 * Each error carries the fields needed to encode a Connect {@link ErrorResponse}
 * or a CLI stderr message at the boundary, without importing Proton domain types.
 *
 * @module
 * @since 0.1.0
 */

import { Data } from "effect"

/**
 * Bearer token missing or not accepted by this server.
 *
 * @category errors
 * @since 0.1.0
 */
export class ConnectUnauthorized extends Data.TaggedError("ConnectUnauthorized")<{
  readonly message: string
}> {}

/**
 * Bearer token valid but cannot access the requested vault.
 *
 * @category errors
 * @since 0.1.0
 */
export class ConnectForbidden extends Data.TaggedError("ConnectForbidden")<{
  readonly message: string
  readonly vaultId?: string
}> {}

/**
 * Vault or item referenced by id does not exist.
 *
 * @category errors
 * @since 0.1.0
 */
export class ConnectNotFound extends Data.TaggedError("ConnectNotFound")<{
  readonly message: string
  readonly resource: "vault" | "item" | "field"
  readonly id?: string
}> {}

/**
 * Request body or parameters are invalid.
 *
 * @category errors
 * @since 0.1.0
 */
export class ConnectBadRequest extends Data.TaggedError("ConnectBadRequest")<{
  readonly message: string
}> {}

/**
 * A documented Connect operation Proton Pass cannot fulfil.
 *
 * @category errors
 * @since 0.1.0
 */
export class ConnectUnsupported extends Data.TaggedError("ConnectUnsupported")<{
  readonly operation: string
  readonly feature: string
  readonly limitation: string
}> {}

/**
 * A documented CLI command Proton Pass cannot fulfil.
 *
 * @category errors
 * @since 0.1.0
 */
export class CliUnsupported extends Data.TaggedError("CliUnsupported")<{
  readonly command: string
  readonly feature: string
  readonly limitation: string
  readonly suggestion?: string
}> {}

/**
 * pass-cli or the alias CLI exited non-zero.
 *
 * @category errors
 * @since 0.1.0
 */
export class CliExit extends Data.TaggedError("CliExit")<{
  readonly exitCode: number
  readonly stderr: string
  readonly command: string
}> {}

/**
 * Vault listing or lookup failed.
 *
 * @category errors
 * @since 0.1.0
 */
export class VaultError extends Data.TaggedError("VaultError")<{
  readonly reason: string
  readonly vaultId?: string
}> {}

/**
 * Item listing, lookup, or field read failed.
 *
 * @category errors
 * @since 0.1.0
 */
export class ItemError extends Data.TaggedError("ItemError")<{
  readonly reason: string
  readonly itemId?: string
  readonly field?: string
}> {}

/**
 * Token validation failed before any vault operation.
 *
 * @category errors
 * @since 0.1.0
 */
export class AuthError extends Data.TaggedError("AuthError")<{
  readonly reason: string
}> {}

/**
 * Every failure the compatibility service can surface.
 *
 * @category models
 * @since 0.1.0
 */
export type OnePasswordCompatError =
  | ConnectUnauthorized
  | ConnectForbidden
  | ConnectNotFound
  | ConnectBadRequest
  | ConnectUnsupported
  | CliUnsupported
  | CliExit
  | VaultError
  | ItemError
  | AuthError

/**
 * Errors that {@link encodeConnectError} knows how to encode.
 *
 * @category models
 * @since 0.1.0
 */
export type ConnectEncodableError =
  | ConnectUnauthorized
  | ConnectForbidden
  | ConnectNotFound
  | ConnectBadRequest
  | ConnectUnsupported
  | AuthError
  | VaultError
  | ItemError

/**
 * Errors that {@link formatCliError} knows how to encode.
 *
 * @category models
 * @since 0.1.0
 */
export type CliEncodableError =
  | CliUnsupported
  | CliExit
  | VaultError
  | ItemError
  | AuthError
  | ConnectUnsupported
