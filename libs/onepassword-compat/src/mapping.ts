/*
 * Project: openclaw-proton-pass
 * File: mapping.ts
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
 * Map Proton Pass items to 1Password Connect contract types.
 *
 * Category and field mapping follows the matrix in issue OPE-17. Alias items
 * read as {@link SECURE_NOTE}; writes of unsupported 1Password categories fail
 * in the service layer rather than here.
 *
 * @module
 * @since 0.1.0
 */

import type { Field, FullItem, Item, ItemCategory } from "@resnovas/opp-onepassword-contract"
import { Effect } from "effect"
import { ConnectUnsupported } from "./errors.js"

/**
 * Proton Pass item types as returned by pass-cli JSON.
 *
 * @category models
 * @since 0.1.0
 */
export type ProtonItemType =
  | "login"
  | "note"
  | "credit_card"
  | "identity"
  | "ssh_key"
  | "wifi"
  | "alias"
  | "custom"

/**
 * One field on a Proton Pass item, normalised for mapping.
 *
 * @category models
 * @since 0.1.0
 */
export interface ProtonField {
  readonly label: string
  readonly value: string
  readonly section?: string
  readonly concealed?: boolean
}

/**
 * A Proton Pass item in the shape pass-cli JSON is normalised to.
 *
 * @category models
 * @since 0.1.0
 */
export interface ProtonItem {
  readonly id: string
  readonly shareId: string
  readonly vaultId: string
  readonly title: string
  readonly type: ProtonItemType
  readonly note: string
  readonly fields: ReadonlyArray<ProtonField>
  readonly trashed: boolean
  readonly createdAt?: string
  readonly updatedAt?: string
}

/**
 * Payload for creating or updating a Proton Pass item from a Connect item.
 *
 * @category models
 * @since 0.1.0
 */
export interface ProtonCreatePayload {
  readonly type: ProtonItemType
  readonly title: string
  readonly note: string
  readonly fields: ReadonlyArray<ProtonField>
}

const PROTON_TO_OP: Readonly<Record<ProtonItemType, ItemCategory>> = {
  login: "LOGIN",
  note: "SECURE_NOTE",
  credit_card: "CREDIT_CARD",
  identity: "IDENTITY",
  ssh_key: "SSH_KEY",
  wifi: "WIRELESS_ROUTER",
  alias: "SECURE_NOTE",
  custom: "CUSTOM"
}

const OP_TO_PROTON: Readonly<Partial<Record<ItemCategory, ProtonItemType>>> = {
  LOGIN: "login",
  PASSWORD: "login",
  SECURE_NOTE: "note",
  CREDIT_CARD: "credit_card",
  IDENTITY: "identity",
  SSH_KEY: "ssh_key",
  WIRELESS_ROUTER: "wifi",
  CUSTOM: "custom"
}

/**
 * Map a Proton Pass item type to the closest 1Password Connect category.
 *
 * @remarks
 * Alias items read as `SECURE_NOTE` with fields preserved. Pure and total over
 * {@link ProtonItemType}.
 *
 * @param type - the Proton Pass item type from pass-cli JSON
 * @returns the Connect category callers should expose
 *
 * @category utils
 * @since 0.1.0
 *
 * @example
 * import { protonCategoryToOpCategory } from "@resnovas/opp-onepassword-compat"
 *
 * assert.strictEqual(protonCategoryToOpCategory("login"), "LOGIN")
 * assert.strictEqual(protonCategoryToOpCategory("alias"), "SECURE_NOTE")
 */
export const protonCategoryToOpCategory = (type: ProtonItemType): ItemCategory =>
  PROTON_TO_OP[type]

/**
 * Map a 1Password Connect category to a Proton Pass item type for writes.
 *
 * @remarks
 * Returns `undefined` when the category cannot be stored in Proton Pass.
 * `PASSWORD` items are stored as Proton logins. Pure and never throws.
 *
 * @param category - the Connect item category
 * @returns the Proton type to create, or `undefined` when unsupported
 *
 * @category utils
 * @since 0.1.0
 *
 * @example
 * import { opCategoryToProtonType } from "@resnovas/opp-onepassword-compat"
 *
 * assert.strictEqual(opCategoryToProtonType("LOGIN"), "login")
 * assert.strictEqual(opCategoryToProtonType("PASSWORD"), "login")
 * assert.strictEqual(opCategoryToProtonType("DOCUMENT"), undefined)
 */
export const opCategoryToProtonType = (
  category: ItemCategory
): ProtonItemType | undefined => OP_TO_PROTON[category]

const protonFieldToConnect = (field: ProtonField): Field => {
  const lower = field.label.toLowerCase()
  const type =
    field.concealed
      ? ("CONCEALED" as const)
      : lower.includes("totp") || lower === "one-time password"
        ? ("TOTP" as const)
        : ("STRING" as const)
  const purpose =
    lower === "password" || lower === "passphrase"
      ? ("PASSWORD" as const)
      : lower === "username" || lower === "email"
        ? ("USERNAME" as const)
        : lower === "notes" || lower === "note"
          ? ("NOTES" as const)
          : undefined

  return {
    label: field.label,
    type,
    ...(purpose === undefined ? {} : { purpose }),
    value: field.value,
    ...(field.section === undefined ? {} : { section: { id: field.section } })
  }
}

const connectFieldToProton = (field: Field): ProtonField => ({
  label: field.label ?? field.purpose ?? "field",
  value: field.value ?? "",
  ...(field.section?.id === undefined ? {} : { section: field.section.id }),
  concealed: field.type === "CONCEALED" || field.purpose === "PASSWORD"
})

/**
 * Convert a normalised Proton Pass item into a Connect {@link FullItem}.
 *
 * @remarks
 * Maps lifecycle state: trashed Proton items surface as Connect `ARCHIVED`.
 * Field labels and values are copied; secrets remain plain strings here and
 * must be wrapped in {@link Redacted} by the caller before crossing a boundary.
 *
 * @param item - the Proton item from pass-cli JSON
 * @param vaultId - the Connect vault id (Proton share id)
 * @returns a Connect full item
 *
 * @category utils
 * @since 0.1.0
 *
 * @example
 * import { protonItemToFullItem } from "@resnovas/opp-onepassword-compat"
 *
 * const full = protonItemToFullItem(
 *   {
 *     id: "item-1",
 *     shareId: "share-1",
 *     vaultId: "vault-1",
 *     title: "GitHub",
 *     type: "login",
 *     note: "",
 *     fields: [{ label: "password", value: "secret", concealed: true }],
 *     trashed: false
 *   },
 *   "share-1"
 * )
 *
 * assert.strictEqual(full.category, "LOGIN")
 * assert.strictEqual(full.fields?.length, 1)
 */
export const protonItemToFullItem = (item: ProtonItem, vaultId: string): FullItem => {
  const fields = item.fields.map((field) => protonFieldToConnect(field))
  if (item.note.length > 0) {
    fields.push({ label: "notes", type: "STRING", purpose: "NOTES", value: item.note })
  }

  return {
    id: item.id,
    title: item.title,
    vault: { id: vaultId },
    category: protonCategoryToOpCategory(item.type),
    ...(item.trashed ? { state: "ARCHIVED" as const } : {}),
    ...(item.createdAt === undefined ? {} : { createdAt: item.createdAt }),
    ...(item.updatedAt === undefined ? {} : { updatedAt: item.updatedAt }),
    fields
  }
}

/**
 * Convert a Connect {@link Item} summary from a Proton list entry.
 *
 * @remarks
 * Omits field values: list endpoints return metadata only, matching Connect
 * behaviour. Trashed Proton items surface as `ARCHIVED`.
 *
 * @param item - the Proton item summary
 * @param vaultId - the Connect vault id
 * @returns a Connect item summary
 *
 * @category utils
 * @since 0.1.0
 *
 * @example
 * import { protonItemToItem } from "@resnovas/opp-onepassword-compat"
 *
 * const summary = protonItemToItem(
 *   {
 *     id: "item-1",
 *     shareId: "share-1",
 *     vaultId: "vault-1",
 *     title: "GitHub",
 *     type: "login",
 *     note: "",
 *     fields: [],
 *     trashed: false
 *   },
 *   "share-1"
 * )
 *
 * assert.strictEqual(summary.category, "LOGIN")
 * assert.strictEqual(summary.title, "GitHub")
 */
export const protonItemToItem = (item: ProtonItem, vaultId: string): Item => ({
  id: item.id,
  title: item.title,
  vault: { id: vaultId },
  category: protonCategoryToOpCategory(item.type),
  ...(item.trashed ? { state: "ARCHIVED" as const } : {}),
  ...(item.createdAt === undefined ? {} : { createdAt: item.createdAt }),
  ...(item.updatedAt === undefined ? {} : { updatedAt: item.updatedAt })
})

/**
 * Convert a Connect {@link FullItem} into a Proton create payload.
 *
 * @remarks
 * Fails with {@link ConnectUnsupported} when the category cannot be stored.
 * 1Password `PASSWORD` items become Proton logins. Pure aside from the
 * unsupported-category branch.
 *
 * @param item - the Connect item to store
 * @returns fields and type for pass-cli item create
 *
 * @category utils
 * @since 0.1.0
 *
 * @example
 * import { fullItemToProtonCreate } from "@resnovas/opp-onepassword-compat"
 * import { Effect } from "effect"
 *
 * const payload = Effect.runSync(
 *   fullItemToProtonCreate({
 *     title: "Example",
 *     category: "LOGIN",
 *     fields: [{ label: "password", type: "CONCEALED", purpose: "PASSWORD", value: "x" }]
 *   })
 * )
 *
 * assert.strictEqual(payload.type, "login")
 */
export const fullItemToProtonCreate = (
  item: FullItem
): Effect.Effect<ProtonCreatePayload, ConnectUnsupported> => {
  const category = item.category ?? "LOGIN"
  const type = opCategoryToProtonType(category)
  if (type === undefined) {
    return Effect.fail(
      new ConnectUnsupported({
        operation: "create item",
        feature: category,
        limitation: "Proton Pass has no equivalent item type for this 1Password category"
      })
    )
  }

  const fields = (item.fields ?? []).map((field) => connectFieldToProton(field))
  const notes = fields.find((field) => field.label.toLowerCase() === "notes")
  const note = notes?.value ?? ""

  return Effect.succeed({
    type,
    title: item.title ?? "Untitled",
    note,
    fields: fields.filter((field) => field.label.toLowerCase() !== "notes")
  })
}
