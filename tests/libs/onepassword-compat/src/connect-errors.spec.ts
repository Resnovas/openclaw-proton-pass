/*
 * Project: openclaw-proton-pass
 * File: connect-errors.spec.ts
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

import { describe, expect, it } from "@effect/vitest"
import {
  AuthError,
  ConnectBadRequest,
  ConnectForbidden,
  ConnectNotFound,
  ConnectUnauthorized,
  ConnectUnsupported,
  encodeConnectError,
  ItemError,
  VaultError
} from "@resnovas/opp-onepassword-compat"

describe("encodeConnectError", () => {
  it("maps unauthorized errors to HTTP 401", () => {
    expect(
      encodeConnectError(new ConnectUnauthorized({ message: "Invalid or missing token" }))
    ).toEqual({ status: 401, message: "Invalid or missing token" })
    expect(encodeConnectError(new AuthError({ reason: "token expired" }))).toEqual({
      status: 401,
      message: "token expired"
    })
  })

  it("maps forbidden errors to HTTP 403", () => {
    expect(
      encodeConnectError(new ConnectForbidden({ message: "Vault not in scope", vaultId: "v1" }))
    ).toEqual({ status: 403, message: "Vault not in scope" })
  })

  it("maps not-found errors to HTTP 404", () => {
    expect(
      encodeConnectError(
        new ConnectNotFound({ message: "Item not found: x", resource: "item", id: "x" })
      )
    ).toEqual({ status: 404, message: "Item not found: x" })
  })

  it("maps bad requests and unsupported operations to HTTP 400", () => {
    expect(encodeConnectError(new ConnectBadRequest({ message: "malformed body" }))).toEqual({
      status: 400,
      message: "malformed body"
    })
    expect(
      encodeConnectError(
        new ConnectUnsupported({
          operation: "getFiles",
          feature: "documents",
          limitation: "Proton Pass has no file attachments"
        })
      )
    ).toEqual({
      status: 400,
      message:
        "Unsupported by Proton Pass: getFiles (documents) - Proton Pass has no file attachments"
    })
  })

  it("maps vault and item errors to HTTP 404 with identifiers", () => {
    expect(encodeConnectError(new VaultError({ reason: "list failed" }))).toEqual({
      status: 404,
      message: "list failed"
    })
    expect(encodeConnectError(new VaultError({ reason: "missing", vaultId: "share-1" }))).toEqual({
      status: 404,
      message: "Vault not found: share-1"
    })
    expect(encodeConnectError(new ItemError({ reason: "missing field", field: "password" }))).toEqual({
      status: 404,
      message: "missing field"
    })
    expect(encodeConnectError(new ItemError({ reason: "missing", itemId: "item-1" }))).toEqual({
      status: 404,
      message: "Item not found: item-1"
    })
  })
})
