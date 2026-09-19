/*
 * Project: openclaw-proton-pass
 * File: route.ts
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
 * The loopback proxy's configuration, with its safety rule in the type.
 *
 * A route names a local path, the remote MCP server behind it, and the secret
 * id whose value is attached on the way through. The listen address cannot
 * represent anything but loopback.
 *
 * @module
 * @since 0.1.0
 */

import { Schema } from "effect"
import { SecretId } from "./secret.js"

/** A hostname the proxy is willing to bind. */
const LOOPBACK = ["127.0.0.1", "::1", "localhost"] as const

/**
 * One loopback route: a local path, and the remote MCP server it fronts.
 *
 * `secretId` names an entry in the secret map rather than a `pass://` URI, so
 * this file records no vault location either.
 *
 * @category schemas
 * @since 0.1.0
 *
 * @example
 * import { Route } from "@resnovas/opp-domain"
 * import { Schema } from "effect"
 *
 * // `header` and `timeoutSeconds` have defaults, so a route is two fields.
 * const route = Schema.decodeUnknownSync(Route)({
 *   upstream: "https://mcp.context7.com/mcp",
 *   secretId: "CONTEXT7_MCP_AUTHORIZATION"
 * })
 *
 * assert.strictEqual(route.header, "Authorization")
 * assert.strictEqual(route.timeoutSeconds, 120)
 */
export const Route = Schema.Struct({
  upstream: Schema.String.pipe(Schema.startsWith("http")),
  header: Schema.optionalWith(Schema.String, { default: () => "Authorization" }),
  secretId: SecretId,
  timeoutSeconds: Schema.optionalWith(Schema.Number.pipe(Schema.positive()), {
    default: () => 120
  })
})

/**
 * The decoded form of {@link Route}, with the header name and timeout filled
 * in from their defaults.
 *
 * @category models
 * @since 0.1.0
 */
export type Route = typeof Route.Type

/**
 * A listen address the proxy will accept.
 *
 * Binding beyond loopback would expose an unauthenticated route that attaches a
 * real credential to anything reaching it, so the type refuses to represent one
 * and the failure happens at configuration load rather than at first request.
 *
 * @category schemas
 * @since 0.1.0
 *
 * @example
 * import { ListenAddress } from "@resnovas/opp-domain"
 * import { Schema } from "effect"
 *
 * const decode = Schema.decodeUnknownSync(ListenAddress)
 *
 * assert.strictEqual(decode("127.0.0.1:18890"), "127.0.0.1:18890")
 *
 * // The loopback-only rule lives in the type, so a configuration that would
 * // serve credentials to the network fails at load rather than at first
 * // request.
 * assert.throws(() => decode("0.0.0.0:18890"))
 * assert.throws(() => decode("127.0.0.1:not-a-port"))
 */
export const ListenAddress = Schema.String.pipe(
  Schema.filter(
    (value) => {
      const index = value.lastIndexOf(":")
      if (index <= 0) return "listen must be host:port"
      const host = value.slice(0, index)
      const port = Number(value.slice(index + 1))
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        return `invalid port in ${value}`
      }
      return LOOPBACK.includes(host as (typeof LOOPBACK)[number])
        ? true
        : `refusing to bind ${host}: this proxy is loopback-only by design`
    },
    { identifier: "ListenAddress" }
  ),
  Schema.brand("ListenAddress")
)

/**
 * The type of a validated {@link ListenAddress}: an address the proxy is
 * allowed to bind, which is always a loopback one.
 *
 * @category models
 * @since 0.1.0
 */
export type ListenAddress = typeof ListenAddress.Type

/**
 * The proxy's whole configuration file.
 *
 * @category schemas
 * @since 0.1.0
 *
 * @example
 * import { ProxyConfig } from "@resnovas/opp-domain"
 * import { Schema } from "effect"
 *
 * const config = Schema.decodeUnknownSync(ProxyConfig)({
 *   routes: {
 *     "/context7": {
 *       upstream: "https://mcp.context7.com/mcp",
 *       secretId: "CONTEXT7_MCP_AUTHORIZATION"
 *     }
 *   }
 * })
 *
 * assert.strictEqual(config.listen, "127.0.0.1:18890")
 */
export const ProxyConfig = Schema.Struct({
  listen: Schema.optionalWith(ListenAddress, {
    default: () => "127.0.0.1:18890" as ListenAddress
  }),
  routes: Schema.Record({ key: Schema.String, value: Route })
})

/**
 * The decoded form of {@link ProxyConfig}: every route this proxy serves, and
 * the address it listens on.
 *
 * @category models
 * @since 0.1.0
 */
export type ProxyConfig = typeof ProxyConfig.Type

/**
 * Split a validated listen address into its host and port.
 *
 * @remarks
 * Total for any value that has passed `ListenAddress`: such a value
 * always contains a colon and an in-range numeric port. Splits on the
 * **last** colon, so an IPv6 host keeps its own. Never throws.
 *
 * @param address - an address that has already passed {@link ListenAddress}
 * @returns the host and port to bind
 *
 * @category utils
 * @since 0.1.0
 *
 * @example
 * import { ListenAddress, splitAddress } from "@resnovas/opp-domain"
 * import { Schema } from "effect"
 *
 * const address = Schema.decodeUnknownSync(ListenAddress)("127.0.0.1:18890")
 *
 * assert.deepStrictEqual(splitAddress(address), { host: "127.0.0.1", port: 18890 })
 *
 * // IPv6 splits on the last colon, not the first.
 * assert.deepStrictEqual(
 *   splitAddress(Schema.decodeUnknownSync(ListenAddress)("::1:18890")),
 *   { host: "::1", port: 18890 }
 * )
 */
export const splitAddress = (
  address: ListenAddress
): { readonly host: string; readonly port: number } => {
  const index = address.lastIndexOf(":")
  return {
    host: address.slice(0, index),
    port: Number(address.slice(index + 1))
  }
}
