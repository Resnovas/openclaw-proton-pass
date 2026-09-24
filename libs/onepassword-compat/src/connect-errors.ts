/*
 * Project: openclaw-proton-pass
 * File: connect-errors.ts
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
 * Encode compatibility failures as 1Password Connect {@link ErrorResponse} bodies.
 *
 * @module
 * @since 0.1.0
 */

import type { ErrorResponse } from "@resnovas/opp-onepassword-contract"
import type { ConnectEncodableError } from "./errors.js"

const unsupportedMessage = (error: {
  readonly operation: string
  readonly feature: string
  readonly limitation: string
}): string =>
  `Unsupported by Proton Pass: ${error.operation} (${error.feature}) - ${error.limitation}`

/**
 * Encode a tagged compatibility error as a Connect HTTP error body.
 *
 * @remarks
 * Returns exactly `{ status, message }` with no extra keys, matching Connect
 * SDK parsers. Total over {@link ConnectEncodableError}. Pure and never throws.
 *
 * @param error - the failure to encode
 * @returns the Connect error response body
 *
 * @category utils
 * @since 0.1.0
 *
 * @example
 * import { encodeConnectError } from "@resnovas/opp-onepassword-compat"
 * import { ConnectUnauthorized } from "@resnovas/opp-onepassword-compat"
 *
 * const body = encodeConnectError(
 *   new ConnectUnauthorized({ message: "Invalid or missing token" })
 * )
 *
 * assert.deepStrictEqual(body, { status: 401, message: "Invalid or missing token" })
 */
export const encodeConnectError = (error: ConnectEncodableError): ErrorResponse => {
  switch (error._tag) {
    case "ConnectUnauthorized":
      return { status: 401, message: error.message }
    case "AuthError":
      return { status: 401, message: error.reason }
    case "ConnectForbidden":
      return { status: 403, message: error.message }
    case "ConnectNotFound":
      return { status: 404, message: error.message }
    case "ConnectBadRequest":
      return { status: 400, message: error.message }
    case "ConnectUnsupported":
      return { status: 400, message: unsupportedMessage(error) }
    case "VaultError":
      return {
        status: 404,
        message: error.vaultId === undefined ? error.reason : `Vault not found: ${error.vaultId}`
      }
    case "ItemError":
      return {
        status: 404,
        message: error.itemId === undefined ? error.reason : `Item not found: ${error.itemId}`
      }
    default: {
      const unreachable: never = error
      return unreachable
    }
  }
}
