/*
 * Project: openclaw-proton-pass
 * File: proton-json.ts
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
 * Schemas and normalisers for pass-cli JSON output.
 *
 * @module
 * @since 0.1.0
 */

import { Schema } from "effect"
import type { ProtonField, ProtonItem, ProtonItemType } from "./mapping.js"

export const PassVaultEntryJson = Schema.Struct({
  name: Schema.String,
  vault_id: Schema.String,
  share_id: Schema.String
})

export const PassVaultListJson = Schema.Struct({
  vaults: Schema.Array(PassVaultEntryJson)
})

export type PassVaultListJson = typeof PassVaultListJson.Type

export const ProtonItemTypeJson = Schema.Literal(
  "login",
  "note",
  "alias",
  "credit_card",
  "identity",
  "ssh_key",
  "wifi",
  "custom"
)

export const PassItemSummaryJson = Schema.Struct({
  id: Schema.String,
  share_id: Schema.String,
  vault_id: Schema.String,
  title: Schema.String,
  item_type: ProtonItemTypeJson,
  state: Schema.optional(Schema.String),
  create_time: Schema.optional(Schema.String),
  modify_time: Schema.optional(Schema.String)
})

export const PassItemsListJson = Schema.Struct({
  items: Schema.Array(PassItemSummaryJson)
})

export type PassItemsListJson = typeof PassItemsListJson.Type

const JsonRecord = Schema.Record({ key: Schema.String, value: Schema.Unknown })

export const PassItemViewJson = Schema.Struct({
  item: Schema.Struct({
    id: Schema.String,
    share_id: Schema.String,
    vault_id: Schema.String,
    state: Schema.optional(Schema.String),
    create_time: Schema.optional(Schema.String),
    modify_time: Schema.optional(Schema.String),
    content: Schema.Struct({
      title: Schema.String,
      note: Schema.optional(Schema.String),
      content: Schema.optional(JsonRecord)
    })
  })
})

export type PassItemViewJson = typeof PassItemViewJson.Type

export const PassInfoJson = Schema.Struct({
  id: Schema.String,
  username: Schema.optional(Schema.String),
  email: Schema.optional(Schema.String),
  personal_access_token_name: Schema.optional(Schema.String),
  release_track: Schema.optional(Schema.String)
})

export type PassInfoJson = typeof PassInfoJson.Type

/** Normalised vault row for mapping and lookup. */
export interface ProtonVault {
  readonly shareId: string
  readonly vaultId: string
  readonly name: string
}

const readString = (record: Record<string, unknown>, key: string): string | undefined => {
  const value = record[key]
  return typeof value === "string" ? value : undefined
}

const contentFields = (
  type: ProtonItemType,
  content: Record<string, unknown> | undefined,
  note: string
): ReadonlyArray<ProtonField> => {
  const fields: Array<ProtonField> = []
  if (content === undefined) {
    if (note.length > 0) {
      fields.push({ label: "notes", value: note })
    }
    return fields
  }

  switch (type) {
    case "login": {
      const username = readString(content, "username")
      const email = readString(content, "email")
      const password = readString(content, "password")
      if (username !== undefined) fields.push({ label: "username", value: username })
      if (email !== undefined) fields.push({ label: "email", value: email })
      if (password !== undefined) {
        fields.push({ label: "password", value: password, concealed: true })
      }
      const urls = content["urls"]
      if (Array.isArray(urls)) {
        urls.forEach((url, index) => {
          if (typeof url === "string") {
            fields.push({ label: index === 0 ? "website" : `website ${index + 1}`, value: url })
          }
        })
      }
      break
    }
    case "note":
      if (note.length > 0) fields.push({ label: "notes", value: note })
      break
    case "alias": {
      const aliasEmail = readString(content, "email")
      if (aliasEmail !== undefined) fields.push({ label: "email", value: aliasEmail })
      if (note.length > 0) fields.push({ label: "notes", value: note })
      break
    }
    case "credit_card": {
      for (const key of [
        "cardholder_name",
        "number",
        "verification_number",
        "expiration_date",
        "pin"
      ]) {
        const value = readString(content, key)
        if (value !== undefined) {
          fields.push({
            label: key.replaceAll("_", " "),
            value,
            concealed: key === "number" || key === "verification_number" || key === "pin"
          })
        }
      }
      break
    }
    case "identity": {
      for (const [key, value] of Object.entries(content)) {
        if (typeof value === "string" && value.length > 0) {
          fields.push({ label: key.replaceAll("_", " "), value })
        }
      }
      break
    }
    case "ssh_key": {
      const privateKey = readString(content, "private_key")
      const publicKey = readString(content, "public_key")
      if (privateKey !== undefined) {
        fields.push({ label: "private key", value: privateKey, concealed: true })
      }
      if (publicKey !== undefined) fields.push({ label: "public key", value: publicKey })
      break
    }
    case "wifi": {
      const ssid = readString(content, "ssid")
      const password = readString(content, "password")
      if (ssid !== undefined) fields.push({ label: "ssid", value: ssid })
      if (password !== undefined) fields.push({ label: "password", value: password, concealed: true })
      break
    }
    case "custom": {
      for (const [key, value] of Object.entries(content)) {
        if (typeof value === "string") fields.push({ label: key, value })
      }
      break
    }
    default: {
      const unreachable: never = type
      return unreachable
    }
  }

  if (note.length > 0 && type !== "note") {
    fields.push({ label: "notes", value: note })
  }
  return fields
}

/**
 * Normalise pass-cli vault list JSON.
 *
 * @param body - decoded `vault list --output json` body
 * @returns vault rows keyed by share id
 *
 * @category utils
 * @since 0.1.0
 */
export const normaliseProtonVaults = (body: PassVaultListJson): ReadonlyArray<ProtonVault> =>
  body.vaults.map((vault) => ({
    shareId: vault.share_id,
    vaultId: vault.vault_id,
    name: vault.name
  }))

const summaryToProtonItem = (
  summary: typeof PassItemSummaryJson.Type
): ProtonItem => ({
  id: summary.id,
  shareId: summary.share_id,
  vaultId: summary.vault_id,
  title: summary.title,
  type: summary.item_type,
  note: "",
  fields: [],
  trashed: summary.state === "Trashed",
  ...(summary.create_time === undefined ? {} : { createdAt: summary.create_time }),
  ...(summary.modify_time === undefined ? {} : { updatedAt: summary.modify_time })
})

/**
 * Normalise pass-cli item list JSON.
 *
 * @param body - decoded `item list --output json` body
 * @returns item summaries without secret fields
 *
 * @category utils
 * @since 0.1.0
 */
export const normaliseProtonItemsList = (body: PassItemsListJson): ReadonlyArray<ProtonItem> =>
  body.items.map((item) => summaryToProtonItem(item))

/**
 * Normalise pass-cli item view JSON.
 *
 * @param body - decoded `item view --output json` body
 * @returns a full item including field values
 *
 * @category utils
 * @since 0.1.0
 */
export const normaliseProtonItemView = (body: PassItemViewJson): ProtonItem => {
  const item = body.item
  const note = item.content.note ?? ""
  const contentRecord =
    item.content.content === undefined
      ? undefined
      : (item.content.content as Record<string, unknown>)
  const type = inferTypeFromContent(contentRecord)

  return {
    id: item.id,
    shareId: item.share_id,
    vaultId: item.vault_id,
    title: item.content.title,
    type,
    note,
    fields: contentFields(type, contentRecord, note),
    trashed: item.state === "Trashed",
    ...(item.create_time === undefined ? {} : { createdAt: item.create_time }),
    ...(item.modify_time === undefined ? {} : { updatedAt: item.modify_time })
  }
}

const inferTypeFromContent = (
  content: Record<string, unknown> | undefined
): ProtonItemType => {
  if (content === undefined) return "note"
  if ("password" in content && ("username" in content || "email" in content || "urls" in content)) {
    return "login"
  }
  if ("private_key" in content) return "ssh_key"
  if ("ssid" in content) return "wifi"
  if ("cardholder_name" in content || "number" in content) return "credit_card"
  if ("email" in content && Object.keys(content).length <= 2) return "alias"
  if ("first_name" in content || "last_name" in content) return "identity"
  return "custom"
}
