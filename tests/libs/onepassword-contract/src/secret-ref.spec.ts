/*
 * Project: openclaw-proton-pass
 * File: secret-ref.spec.ts
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
import { parseOpSecretRef, decodeParsedOpSecretRef } from "@resnovas/opp-onepassword-contract"
import { Effect, Exit } from "effect"

describe("parseOpSecretRef", () => {
  it("parses a three-segment reference", () => {
    const ref = Effect.runSync(parseOpSecretRef("op://Private/db/password"))
    expect(ref.vault).toBe("Private")
    expect(ref.item).toBe("db")
    expect(ref.field).toBe("password")
  })

  it("parses a four-segment reference with otp attribute", () => {
    const ref = Effect.runSync(
      parseOpSecretRef("op://development/GitHub/Security/one-time password?attribute=otp")
    )
    expect(ref.section).toBe("Security")
    expect(ref.attribute).toBe("otp")
  })

  it("fails on the wrong scheme", () => {
    const exit = Effect.runSyncExit(parseOpSecretRef("pass://Private/db/password"))
    expect(Exit.isFailure(exit)).toBe(true)
  })

  it("parses sectioned references with ssh-format", () => {
    const ref = Effect.runSync(
      parseOpSecretRef("op://Private/ssh%20keys/ssh%20key/private%20key?ssh-format=openssh")
    )
    expect(ref.section).toBe("ssh key")
    expect(ref.sshFormat).toBe("openssh")
  })

  it("accepts attr=otp as an alias for attribute=otp", () => {
    const ref = Effect.runSync(parseOpSecretRef("op://Private/GitHub/totp?attr=otp"))
    expect(ref.attribute).toBe("otp")
  })

  it("fails when the path has the wrong number of segments", () => {
    const exit = Effect.runSyncExit(parseOpSecretRef("op://Private/db"))
    expect(Exit.isFailure(exit)).toBe(true)
  })

  it("fails when a segment is empty after decoding", () => {
    const exit = Effect.runSyncExit(parseOpSecretRef("op://Private//password"))
    expect(Exit.isFailure(exit)).toBe(true)
  })

  it("fails when a segment is not valid URI encoding", () => {
    const exit = Effect.runSyncExit(parseOpSecretRef("op://Private/%ZZ/db/password"))
    expect(Exit.isFailure(exit)).toBe(true)
  })

  it("fails on unsupported attribute query values", () => {
    const exit = Effect.runSyncExit(parseOpSecretRef("op://Private/db/password?attribute=files"))
    expect(Exit.isFailure(exit)).toBe(true)
  })

  it("fails on unsupported ssh-format query values", () => {
    const exit = Effect.runSyncExit(parseOpSecretRef("op://Private/db/password?ssh-format=pem"))
    expect(Exit.isFailure(exit)).toBe(true)
  })

  it("fails when decoded components violate the schema", () => {
    const exit = Effect.runSyncExit(parseOpSecretRef("op://Private/db/"))
    expect(Exit.isFailure(exit)).toBe(true)

    const schemaExit = Effect.runSyncExit(
      decodeParsedOpSecretRef("op://Private/db/password", {
        vault: "",
        item: "db",
        field: "password"
      })
    )
    expect(Exit.isFailure(schemaExit)).toBe(true)
  })
})
