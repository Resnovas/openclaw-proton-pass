/*
 * Project: openclaw-proton-pass
 * File: pass-ref.ts
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
 * Convert 1Password secret references into Proton Pass `pass://` references.
 *
 * @module
 * @since 0.1.0
 */

import type { OpSecretRef } from "@resnovas/opp-onepassword-contract"

const PASS_SCHEME = "pass://"

/**
 * Build a Proton Pass secret reference from a parsed `op://` reference.
 *
 * @remarks
 * Maps `op://vault/item/field` to `pass://vault/item/field` and
 * `op://vault/item/section/field` to `pass://vault/item/section/field`.
 * Query parameters are translated where Proton Pass understands them:
 * `attribute=otp` becomes `totp=code`, and `ssh-format=openssh` is preserved.
 * Pure: no I/O.
 *
 * @param ref - the branded 1Password secret reference components
 * @returns a `pass://` URI for pass-cli
 *
 * @category utils
 * @since 0.1.0
 *
 * @example
 * import { opSecretRefToPassRef } from "@resnovas/opp-onepassword-compat"
 * import { Schema } from "effect"
 * import { OpSecretRef } from "@resnovas/opp-onepassword-contract"
 *
 * const ref = Schema.decodeUnknownSync(OpSecretRef)({
 *   vault: "Private",
 *   item: "db",
 *   field: "password"
 * })
 *
 * assert.strictEqual(opSecretRefToPassRef(ref), "pass://Private/db/password")
 */
export const opSecretRefToPassRef = (ref: OpSecretRef): string => {
  const segments =
    ref.section === undefined
      ? [ref.vault, ref.item, ref.field]
      : [ref.vault, ref.item, ref.section, ref.field]

  const params = new URLSearchParams()
  if (ref.attribute === "otp") {
    params.set("totp", "code")
  }
  if (ref.sshFormat === "openssh") {
    params.set("ssh-format", "openssh")
  }

  const query = params.toString()
  const path = segments.join("/")
  return query.length === 0 ? `${PASS_SCHEME}${path}` : `${PASS_SCHEME}${path}?${query}`
}
