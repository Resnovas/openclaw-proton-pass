/*
 * Project: openclaw-proton-pass
 * File: connect.ts
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
 * Effect schemas for the 1Password Connect Server API.
 *
 * These types mirror the vendored OpenAPI specification at version
 * {@link CONNECT_API_VERSION}. They carry no I/O and no Proton Pass types: a
 * Connect client or compatibility shim can decode responses at the boundary
 * without importing anything else from this repository.
 *
 * @module
 * @since 0.1.0
 */

import { Schema } from "effect"

/**
 * The Connect Server API version this contract targets.
 *
 * @category constants
 * @since 0.1.0
 */
export const CONNECT_API_VERSION = "1.8.1" as const

/**
 * An error body returned by the Connect Server on failed requests.
 *
 * @category schemas
 * @since 0.1.0
 *
 * @example
 * import { ErrorResponse } from "@resnovas/opp-onepassword-contract"
 * import { Schema } from "effect"
 *
 * const error = Schema.decodeUnknownSync(ErrorResponse)({
 *   status: 404,
 *   message: "item not found"
 * })
 *
 * assert.strictEqual(error.status, 404)
 * assert.strictEqual(error.message, "item not found")
 */
export const ErrorResponse = Schema.Struct({
  status: Schema.Number,
  message: Schema.String
})

/**
 * The decoded form of {@link ErrorResponse}.
 *
 * @category models
 * @since 0.1.0
 */
export type ErrorResponse = typeof ErrorResponse.Type

/**
 * A reference to a vault by UUID.
 *
 * @category schemas
 * @since 0.1.0
 */
export const VaultRef = Schema.Struct({
  id: Schema.String
})

/**
 * The decoded form of {@link VaultRef}.
 *
 * @category models
 * @since 0.1.0
 */
export type VaultRef = typeof VaultRef.Type

/**
 * The lifecycle state of an item in Connect.
 *
 * @category schemas
 * @since 0.1.0
 */
export const ItemState = Schema.Literal("ARCHIVED", "DELETED")

/**
 * The decoded form of {@link ItemState}.
 *
 * @category models
 * @since 0.1.0
 */
export type ItemState = typeof ItemState.Type

/**
 * The category of a 1Password item in Connect.
 *
 * @category schemas
 * @since 0.1.0
 */
export const ItemCategory = Schema.Literal(
  "LOGIN",
  "PASSWORD",
  "API_CREDENTIAL",
  "SERVER",
  "DATABASE",
  "CREDIT_CARD",
  "MEMBERSHIP",
  "PASSPORT",
  "SOFTWARE_LICENSE",
  "OUTDOOR_LICENSE",
  "SECURE_NOTE",
  "WIRELESS_ROUTER",
  "BANK_ACCOUNT",
  "DRIVER_LICENSE",
  "IDENTITY",
  "REWARD_PROGRAM",
  "DOCUMENT",
  "EMAIL_ACCOUNT",
  "SOCIAL_SECURITY_NUMBER",
  "MEDICAL_RECORD",
  "SSH_KEY",
  "CUSTOM"
)

/**
 * The decoded form of {@link ItemCategory}.
 *
 * @category models
 * @since 0.1.0
 */
export type ItemCategory = typeof ItemCategory.Type

/**
 * The type of a field within a Connect item.
 *
 * @category schemas
 * @since 0.1.0
 */
export const FieldType = Schema.Literal(
  "STRING",
  "EMAIL",
  "CONCEALED",
  "URL",
  "TOTP",
  "DATE",
  "MONTH_YEAR",
  "MENU"
)

/**
 * The decoded form of {@link FieldType}.
 *
 * @category models
 * @since 0.1.0
 */
export type FieldType = typeof FieldType.Type

/**
 * The built-in purpose of a Connect field, when one applies.
 *
 * @category schemas
 * @since 0.1.0
 */
export const FieldPurpose = Schema.Literal("USERNAME", "PASSWORD", "NOTES")

/**
 * The decoded form of {@link FieldPurpose}.
 *
 * @category models
 * @since 0.1.0
 */
export type FieldPurpose = typeof FieldPurpose.Type

/**
 * A section within an item, used to group fields.
 *
 * @category schemas
 * @since 0.1.0
 *
 * @example
 * import { Section } from "@resnovas/opp-onepassword-contract"
 * import { Schema } from "effect"
 *
 * const section = Schema.decodeUnknownSync(Section)({
 *   id: "add more data",
 *   label: "Security"
 * })
 *
 * assert.strictEqual(section.label, "Security")
 */
export const Section = Schema.Struct({
  id: Schema.optional(Schema.String),
  label: Schema.optional(Schema.String)
})

/**
 * The decoded form of {@link Section}.
 *
 * @category models
 * @since 0.1.0
 */
export type Section = typeof Section.Type

/**
 * A field on a Connect item.
 *
 * @category schemas
 * @since 0.1.0
 *
 * @example
 * import { Field } from "@resnovas/opp-onepassword-contract"
 * import { Schema } from "effect"
 *
 * const field = Schema.decodeUnknownSync(Field)({
 *   label: "password",
 *   type: "CONCEALED",
 *   purpose: "PASSWORD",
 *   value: "hunter2"
 * })
 *
 * assert.strictEqual(field.purpose, "PASSWORD")
 */
export const Field = Schema.Struct({
  id: Schema.optional(Schema.String),
  section: Schema.optional(Schema.Struct({ id: Schema.optional(Schema.String) })),
  type: Schema.optional(FieldType),
  purpose: Schema.optional(FieldPurpose),
  label: Schema.optional(Schema.String),
  value: Schema.optional(Schema.String),
  generate: Schema.optional(Schema.Boolean),
  entropy: Schema.optional(Schema.Number)
})

/**
 * The decoded form of {@link Field}.
 *
 * @category models
 * @since 0.1.0
 */
export type Field = typeof Field.Type

/**
 * A vault visible to a Connect server.
 *
 * @category schemas
 * @since 0.1.0
 *
 * @example
 * import { Vault } from "@resnovas/opp-onepassword-contract"
 * import { Schema } from "effect"
 *
 * const vault = Schema.decodeUnknownSync(Vault)({
 *   id: "hifg8xikeaxmykblaxz",
 *   name: "Private",
 *   items: 42
 * })
 *
 * assert.strictEqual(vault.name, "Private")
 */
export const Vault = Schema.Struct({
  id: Schema.optional(Schema.String),
  name: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
  attributeVersion: Schema.optional(Schema.Number),
  contentVersion: Schema.optional(Schema.Number),
  items: Schema.optional(Schema.Number),
  type: Schema.optional(
    Schema.Literal("USER_CREATED", "PERSONAL", "EVERYONE", "TRANSFER")
  ),
  createdAt: Schema.optional(Schema.String),
  updatedAt: Schema.optional(Schema.String)
})

/**
 * The decoded form of {@link Vault}.
 *
 * @category models
 * @since 0.1.0
 */
export type Vault = typeof Vault.Type

/**
 * A summary view of an item returned by list endpoints.
 *
 * @category schemas
 * @since 0.1.0
 *
 * @example
 * import { Item } from "@resnovas/opp-onepassword-contract"
 * import { Schema } from "effect"
 *
 * const item = Schema.decodeUnknownSync(Item)({
 *   id: "b5n8m2n9k4j3h2g1f0e9d8c7",
 *   title: "GitHub",
 *   category: "LOGIN",
 *   vault: { id: "hifg8xikeaxmykblaxz" }
 * })
 *
 * assert.strictEqual(item.category, "LOGIN")
 */
export const Item = Schema.Struct({
  id: Schema.optional(Schema.String),
  title: Schema.optional(Schema.String),
  vault: Schema.optional(VaultRef),
  category: Schema.optional(ItemCategory),
  favorite: Schema.optional(Schema.Boolean),
  tags: Schema.optional(Schema.Array(Schema.String)),
  version: Schema.optional(Schema.Number),
  state: Schema.optional(ItemState),
  createdAt: Schema.optional(Schema.String),
  updatedAt: Schema.optional(Schema.String),
  lastEditedBy: Schema.optional(Schema.String)
})

/**
 * The decoded form of {@link Item}.
 *
 * @category models
 * @since 0.1.0
 */
export type Item = typeof Item.Type

/**
 * A complete item including its fields and sections.
 *
 * @category schemas
 * @since 0.1.0
 *
 * @example
 * import { FullItem } from "@resnovas/opp-onepassword-contract"
 * import { Schema } from "effect"
 *
 * const item = Schema.decodeUnknownSync(FullItem)({
 *   title: "GitHub",
 *   category: "LOGIN",
 *   fields: [{ label: "password", type: "CONCEALED", purpose: "PASSWORD" }],
 *   sections: [{ label: "Security" }]
 * })
 *
 * assert.strictEqual(item.fields?.length, 1)
 */
export const FullItem = Item.pipe(
  Schema.extend(
    Schema.Struct({
      fields: Schema.optional(Schema.Array(Field)),
      sections: Schema.optional(Schema.Array(Section))
    })
  )
)

/**
 * The decoded form of {@link FullItem}.
 *
 * @category models
 * @since 0.1.0
 */
export type FullItem = typeof FullItem.Type
