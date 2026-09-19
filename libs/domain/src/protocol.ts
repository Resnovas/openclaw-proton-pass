/*
 * Project: openclaw-proton-pass
 * File: protocol.ts
 * Last Modified: 2026-09-18
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
 * The JSON contract between the OpenClaw Gateway and the resolver.
 *
 * One request on stdin, one response on stdout. Per-id failures travel inside
 * the response rather than failing it, so one unknown id does not cost the
 * Gateway every other secret it asked for.
 *
 * @module
 * @since 0.1.0
 */

import { Schema } from "effect"
import { SecretId } from "./secret.js"

/**
 * The one protocol version this provider implements.
 *
 * @category constants
 * @since 0.1.0
 */
export const PROTOCOL_VERSION = 1 as const

/**
 * A request from the OpenClaw Gateway on stdin.
 *
 * `provider` is accepted but not checked: the Gateway only ever invokes the
 * command it was configured with, so rejecting a name mismatch would fail
 * correct configurations that simply named the provider differently.
 *
 * @category schemas
 * @since 0.1.0
 *
 * @example
 * import { ResolveRequest } from "@resnovas/opp-domain"
 * import { Schema } from "effect"
 *
 * const request = Schema.decodeUnknownSync(ResolveRequest)({
 *   protocolVersion: 1,
 *   provider: "protonpass",
 *   ids: ["CONTEXT7_API_KEY"]
 * })
 *
 * assert.deepStrictEqual(request.ids, ["CONTEXT7_API_KEY"])
 *
 * // A request that asks for nothing is still well formed.
 * assert.deepStrictEqual(
 *   Schema.decodeUnknownSync(ResolveRequest)({ protocolVersion: 1 }).ids,
 *   []
 * )
 */
export const ResolveRequest = Schema.Struct({
  protocolVersion: Schema.Literal(PROTOCOL_VERSION),
  provider: Schema.optional(Schema.String),
  ids: Schema.optionalWith(Schema.Array(SecretId), { default: () => [] })
})

/**
 * The decoded form of {@link ResolveRequest}: the ids one Gateway call is
 * asking for.
 *
 * @category models
 * @since 0.1.0
 */
export type ResolveRequest = typeof ResolveRequest.Type

/**
 * The reason a single id could not be resolved.
 *
 * There is exactly one reason, because the provider deliberately does not
 * distinguish "absent from the map" from "the vault holds nothing there": both
 * are answered identically so a caller cannot use the provider to discover
 * which ids exist.
 *
 * @category schemas
 * @since 0.1.0
 */
export const ResolveFailure = Schema.Literal("NOT_FOUND")

/**
 * The decoded form of {@link ResolveFailure}.
 *
 * @category models
 * @since 0.1.0
 */
export type ResolveFailure = typeof ResolveFailure.Type

/**
 * The response written to stdout.
 *
 * Per-id failures travel in `errors` rather than failing the whole batch, so
 * one unknown id does not deny the Gateway every other secret it asked for.
 * `error` is for protocol-level failure, where no value could be produced.
 *
 * @category schemas
 * @since 0.1.0
 *
 * @example
 * import { ResolveResponse } from "@resnovas/opp-domain"
 * import { Schema } from "effect"
 *
 * // One unknown id does not deny the Gateway the others.
 * const response = Schema.decodeUnknownSync(ResolveResponse)({
 *   protocolVersion: 1,
 *   values: { CONTEXT7_API_KEY: "from-the-vault" },
 *   errors: { TYPO_IN_THE_MAP: "NOT_FOUND" }
 * })
 *
 * assert.deepStrictEqual(Object.keys(response.values ?? {}), ["CONTEXT7_API_KEY"])
 * assert.deepStrictEqual(response.errors, { TYPO_IN_THE_MAP: "NOT_FOUND" })
 */
export const ResolveResponse = Schema.Struct({
  protocolVersion: Schema.Literal(PROTOCOL_VERSION),
  values: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.String })),
  errors: Schema.optional(Schema.Record({ key: Schema.String, value: ResolveFailure })),
  error: Schema.optional(Schema.String)
})

/**
 * The decoded form of {@link ResolveResponse}: what the Gateway reads back on
 * stdout.
 *
 * @category models
 * @since 0.1.0
 */
export type ResolveResponse = typeof ResolveResponse.Type
