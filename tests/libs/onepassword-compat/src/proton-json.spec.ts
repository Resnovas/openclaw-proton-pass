/*
 * Project: openclaw-proton-pass
 * File: proton-json.spec.ts
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
  normaliseProtonItemView,
  normaliseProtonItemsList,
  normaliseProtonVaults,
  type PassItemViewJson,
  type PassItemsListJson,
  type PassVaultListJson
} from "@resnovas/opp-onepassword-compat"

describe("normaliseProtonVaults", () => {
  it("maps share ids and names", () => {
    const body: PassVaultListJson = {
      vaults: [{ name: "OpenClaw", vault_id: "v1", share_id: "s1" }]
    }
    expect(normaliseProtonVaults(body)).toEqual([
      { shareId: "s1", vaultId: "v1", name: "OpenClaw" }
    ])
  })
})

describe("normaliseProtonItemsList", () => {
  it("maps summaries and lifecycle metadata", () => {
    const body: PassItemsListJson = {
      items: [
        {
          id: "i1",
          share_id: "s1",
          vault_id: "v1",
          title: "Example",
          item_type: "login",
          state: "Trashed",
          create_time: "2026-01-01",
          modify_time: "2026-01-02"
        }
      ]
    }
    const items = normaliseProtonItemsList(body)
    expect(items[0]?.trashed).toBe(true)
    expect(items[0]?.createdAt).toBe("2026-01-01")
    expect(items[0]?.updatedAt).toBe("2026-01-02")
  })
})

describe("normaliseProtonItemView", () => {
  const baseItem = (content: Record<string, unknown>, note = ""): PassItemViewJson => ({
    item: {
      id: "i1",
      share_id: "s1",
      vault_id: "v1",
      state: "Active",
      content: {
        title: "Example",
        note,
        content
      }
    }
  })

  it("maps login fields including multiple urls", () => {
    const item = normaliseProtonItemView(
      baseItem({
        username: "wendy",
        email: "wendy@example.com",
        password: "secret",
        urls: ["https://one.example", "https://two.example"]
      })
    )
    expect(item.type).toBe("login")
    expect(item.fields.some((field) => field.label === "website 2")).toBe(true)
  })

  it("maps note-only items without content", () => {
    const item = normaliseProtonItemView({
      item: {
        id: "i1",
        share_id: "s1",
        vault_id: "v1",
        content: { title: "Note", note: "hello" }
      }
    })
    expect(item.type).toBe("note")
    expect(item.fields).toEqual([{ label: "notes", value: "hello" }])
  })

  it("maps alias items", () => {
    const item = normaliseProtonItemView(baseItem({ email: "alias@example.com" }, "alias note"))
    expect(item.type).toBe("alias")
    expect(item.fields.some((field) => field.label === "email")).toBe(true)
  })

  it("maps credit card fields", () => {
    const item = normaliseProtonItemView(
      baseItem({
        cardholder_name: "Pat",
        number: "4111",
        verification_number: "123",
        expiration_date: "01/30",
        pin: "9999"
      })
    )
    expect(item.type).toBe("credit_card")
    expect(item.fields.some((field) => field.concealed === true)).toBe(true)
  })

  it("maps identity fields", () => {
    const item = normaliseProtonItemView(
      baseItem({ first_name: "Pat", last_name: "Example", ignored: 1 })
    )
    expect(item.type).toBe("identity")
    expect(item.fields.some((field) => field.label === "first name")).toBe(true)
  })

  it("maps ssh keys", () => {
    const item = normaliseProtonItemView(
      baseItem({ private_key: "PRIVATE", public_key: "PUBLIC" })
    )
    expect(item.type).toBe("ssh_key")
    expect(item.fields.some((field) => field.label === "private key")).toBe(true)
  })

  it("maps wifi credentials", () => {
    const item = normaliseProtonItemView(baseItem({ ssid: "Home", password: "wifi-secret" }))
    expect(item.type).toBe("wifi")
    expect(item.fields.some((field) => field.label === "ssid")).toBe(true)
  })

  it("maps custom string fields", () => {
    const item = normaliseProtonItemView(baseItem({ custom_a: "one", custom_b: "two" }))
    expect(item.type).toBe("custom")
    expect(item.fields).toHaveLength(2)
  })

  it("appends notes to non-note items", () => {
    const item = normaliseProtonItemView(
      baseItem({ username: "wendy", password: "secret", urls: [] }, "extra note")
    )
    expect(item.fields.some((field) => field.label === "notes" && field.value === "extra note")).toBe(
      true
    )
  })

  it("maps note items when pass-cli repeats the item type", () => {
    const item = normaliseProtonItemView({
      item: {
        id: "i1",
        share_id: "s1",
        vault_id: "v1",
        content: {
          title: "Note",
          note: "hello",
          content: { item_type: "note" }
        }
      }
    })
    expect(item.type).toBe("note")
    expect(item.fields).toEqual([{ label: "notes", value: "hello" }])
  })

  it("honours explicit item_type values from pass-cli JSON", () => {
    for (const itemType of [
      "credit_card",
      "identity",
      "ssh_key",
      "wifi",
      "alias",
      "custom"
    ] as const) {
      const item = normaliseProtonItemView({
        item: {
          id: "i1",
          share_id: "s1",
          vault_id: "v1",
          content: {
            title: "Example",
            note: "",
            content: { item_type: itemType, marker: "x" }
          }
        }
      })
      expect(item.type).toBe(itemType)
    }
  })

  it("preserves optional lifecycle metadata on item views", () => {
    const item = normaliseProtonItemView({
      item: {
        id: "i1",
        share_id: "s1",
        vault_id: "v1",
        state: "Active",
        create_time: "2026-01-01",
        modify_time: "2026-01-02",
        content: {
          title: "Example",
          note: "inline note",
          content: { username: "user", password: "secret", urls: [] }
        }
      }
    })
    expect(item.createdAt).toBe("2026-01-01")
    expect(item.updatedAt).toBe("2026-01-02")
    expect(item.note).toBe("inline note")
  })

  it("defaults missing notes to an empty string", () => {
    const item = normaliseProtonItemView({
      item: {
        id: "i1",
        share_id: "s1",
        vault_id: "v1",
        content: {
          title: "Example",
          content: { username: "user", password: "secret", urls: [] }
        }
      }
    })
    expect(item.note).toBe("")
  })
})
