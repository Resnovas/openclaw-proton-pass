/*
 * Project: openclaw-proton-pass
 * File: config.ts
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
 * Connect server configuration: loopback listen address from the environment.
 *
 * @module
 * @since 0.1.0
 */

import { ListenAddress } from "@resnovas/opp-domain"
import { Data, Effect, Schema } from "effect"

/**
 * Raised when {@link loadConfig} cannot decode a valid loopback listen address.
 *
 * @category errors
 * @since 0.1.0
 */
export class ConnectConfigError extends Data.TaggedError("ConnectConfigError")<{
  readonly reason: string
}> {}

/**
 * The Connect server's validated configuration.
 *
 * @category schemas
 * @since 0.1.0
 *
 * @example
 * import { ConnectConfig } from "@resnovas/opp-connect/config"
 * import { Schema } from "effect"
 *
 * const config = Schema.decodeUnknownSync(ConnectConfig)({
 *   listen: "127.0.0.1:8087"
 * })
 *
 * assert.strictEqual(config.listen, "127.0.0.1:8087")
 */
export const ConnectConfig = Schema.Struct({
  listen: ListenAddress
})

/**
 * The decoded form of {@link ConnectConfig}.
 *
 * @category models
 * @since 0.1.0
 */
export type ConnectConfig = typeof ConnectConfig.Type

/**
 * Load and validate the Connect listen address.
 *
 * @remarks
 * Reads `OP_CONNECT_LISTEN`, defaulting to `127.0.0.1:8087`. Validation
 * rejects a non-loopback address here, at load, rather than at first request:
 * binding beyond loopback would expose vault data to anything that reaches it.
 *
 * @returns the validated configuration
 *
 * @category config
 * @since 0.1.0
 *
 * @example
 * import { loadConfig } from "@resnovas/opp-connect/config"
 * import { Effect } from "effect"
 *
 * process.env["OP_CONNECT_LISTEN"] = "127.0.0.1:9090"
 * const config = Effect.runSync(loadConfig)
 *
 * assert.strictEqual(config.listen, "127.0.0.1:9090")
 */
export const loadConfig = Effect.gen(function* () {
  const listenRaw = process.env["OP_CONNECT_LISTEN"] ?? "127.0.0.1:8087"
  return yield* Schema.decodeUnknown(ConnectConfig)({ listen: listenRaw }).pipe(
    Effect.mapError((cause) => new ConnectConfigError({ reason: String(cause) }))
  )
})
