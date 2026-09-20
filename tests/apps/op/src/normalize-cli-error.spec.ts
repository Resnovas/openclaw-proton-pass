/*
 * Project: openclaw-proton-pass
 * File: normalize-cli-error.spec.ts
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
import { normalizeCliError } from "@resnovas/opp-op"
import { ItemError } from "@resnovas/opp-onepassword-compat"

describe("normalizeCliError", () => {
  it("maps unknown failures to ItemError", () => {
    const error = normalizeCliError(new Error("unexpected failure"))
    expect(error).toBeInstanceOf(ItemError)
    expect(error.reason).toContain("unexpected failure")
  })

  it("maps parse failures that only expose a message field", () => {
    const error = normalizeCliError({ _tag: "OpSecretRefParseError", message: "bad reference" })
    expect(error.reason).toBe("bad reference")
  })

  it("prefers explicit parse reasons over messages", () => {
    const error = normalizeCliError({
      _tag: "OpSecretRefParseError",
      reason: "expected op://vault/item/field",
      message: "bad reference"
    })
    expect(error.reason).toBe("expected op://vault/item/field")
  })

  it("falls back when a parse failure exposes neither reason nor message", () => {
    const error = normalizeCliError({ _tag: "OpSecretRefParseError" })
    expect(error.reason).toBe("invalid secret reference")
  })
})
