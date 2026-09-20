/*
 * Project: openclaw-proton-pass
 * File: mapping.spec.ts
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
  fullItemToProtonCreate,
  opCategoryToProtonType,
  protonCategoryToOpCategory,
  protonItemToFullItem,
  type ProtonItem,
  type ProtonItemType
} from "@resnovas/opp-onepassword-compat"
import { Effect, Exit } from "effect"

const sampleItem = (type: ProtonItemType, extra: Partial<ProtonItem> = {}): ProtonItem => ({
  id: "item-1",
  shareId: "share-1",
  vaultId: "vault-1",
  title: "Example",
  type,
  note: "",
  fields:
    type === "login"
      ? [
          { label: "username", value: "user" },
          { label: "password", value: "secret", concealed: true }
        ]
      : type === "note"
        ? [{ label: "notes", value: "hello" }]
        : [],
  trashed: false,
  ...extra
})

describe("category mapping", () => {
  it("maps every supported Proton type to Connect", () => {
    expect(protonCategoryToOpCategory("login")).toBe("LOGIN")
    expect(protonCategoryToOpCategory("note")).toBe("SECURE_NOTE")
    expect(protonCategoryToOpCategory("credit_card")).toBe("CREDIT_CARD")
    expect(protonCategoryToOpCategory("identity")).toBe("IDENTITY")
    expect(protonCategoryToOpCategory("ssh_key")).toBe("SSH_KEY")
    expect(protonCategoryToOpCategory("wifi")).toBe("WIRELESS_ROUTER")
    expect(protonCategoryToOpCategory("alias")).toBe("SECURE_NOTE")
  })

  it("maps Connect categories back to Proton types for writes", () => {
    expect(opCategoryToProtonType("LOGIN")).toBe("login")
    expect(opCategoryToProtonType("PASSWORD")).toBe("login")
    expect(opCategoryToProtonType("SECURE_NOTE")).toBe("note")
    expect(opCategoryToProtonType("DOCUMENT")).toBeUndefined()
  })
})

describe("protonItemToFullItem", () => {
  it("round-trips login fields through Connect and back", () => {
    const proton = sampleItem("login")
    const full = protonItemToFullItem(proton, "share-1")
    expect(full.category).toBe("LOGIN")
    expect(full.fields?.some((field) => field.purpose === "PASSWORD")).toBe(true)

    const recreated = Effect.runSync(
      fullItemToProtonCreate({
        title: full.title,
        category: full.category,
        fields: full.fields
      })
    )
    expect(recreated.type).toBe("login")
    expect(recreated.fields.find((field) => field.label === "password")?.value).toBe("secret")
  })

  it("reads alias items as secure notes", () => {
    const full = protonItemToFullItem(
      sampleItem("alias", { fields: [{ label: "email", value: "alias@example.com" }] }),
      "share-1"
    )
    expect(full.category).toBe("SECURE_NOTE")
  })

  it("fails create for unsupported Connect categories", () => {
    const result = Effect.runSyncExit(
      fullItemToProtonCreate({ title: "Doc", category: "DOCUMENT", fields: [] })
    )
    expect(Exit.isFailure(result)).toBe(true)
  })
})
