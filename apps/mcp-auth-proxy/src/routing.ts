/*
 * Project: openclaw-proton-pass
 * File: routing.ts
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
 * Route matching and header rewriting.
 *
 * Pure functions, separated from the server so each rewriting rule can be
 * tested without a socket.
 *
 * @module
 * @since 0.1.0
 */

import type { ProxyConfig, Route } from "@resnovas/opp-domain"
import { Option } from "effect"

/** Headers describing a single hop, which must not be forwarded across one. */
export const HOP_BY_HOP: ReadonlySet<string> = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade"
])

/**
 * Find the route serving a request path.
 *
 * A trailing slash is accepted either way, because an operator writing
 * `/example/` in OpenClaw and `/example` in the route file has made no
 * meaningful mistake.
 *
 * @remarks
 * Pure and total. Matches exactly, after normalising a trailing slash in
 * either direction, and ignores the query string. Returns `Option.none()`
 * for an unknown path rather than failing.
 *
 * @param config - the loaded proxy configuration
 * @param url - the request URL, path and query
 * @returns the matching route, if any
 *
 * @example
 * import { ProxyConfig } from "@resnovas/opp-domain"
 * import { matchRoute } from "@resnovas/opp-mcp-auth-proxy/routing"
 * import { Option, Schema } from "effect"
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
 * // A trailing slash either way is the same route, and the query is ignored.
 * assert.strictEqual(Option.isSome(matchRoute(config, "/context7")), true)
 * assert.strictEqual(Option.isSome(matchRoute(config, "/context7/")), true)
 * assert.strictEqual(Option.isSome(matchRoute(config, "/context7?session=1")), true)
 * assert.strictEqual(Option.isNone(matchRoute(config, "/elsewhere")), true)
 */
export const matchRoute = (
  config: ProxyConfig,
  url: string
): Option.Option<Route> => {
  const path = url.split("?")[0] || "/"
  const trimmed = path.replace(/\/+$/, "") === "" ? "/" : path.replace(/\/+$/, "")
  const direct = config.routes[trimmed]
  if (direct !== undefined) return Option.some(direct)
  const slashed = config.routes[`${trimmed}/`]
  return slashed !== undefined ? Option.some(slashed) : Option.none()
}

/**
 * Build the header set to send upstream.
 *
 * Hop-by-hop headers and the inbound Host are dropped, the credential header is
 * set from the resolved secret, and Content-Length is restated for the body
 * actually being forwarded.
 *
 * @remarks
 * Pure and total. Drops hop-by-hop headers, the inbound `Host` and the
 * inbound `Content-Length`; sets the upstream `Host`, the route's
 * credential header, and restates `Content-Length` only for a non-empty
 * body. `secret` is taken already unwrapped, which makes the caller one of
 * the three places in this system that realises a redacted value.
 *
 * @param inbound - headers as received from OpenClaw
 * @param route - the matched route
 * @param secret - the resolved credential value
 * @param upstreamHost - host of the upstream URL
 * @param bodyLength - byte length of the forwarded body, if any
 *
 * @example
 * import { Route } from "@resnovas/opp-domain"
 * import { outboundHeaders } from "@resnovas/opp-mcp-auth-proxy/routing"
 * import { Schema } from "effect"
 *
 * const route = Schema.decodeUnknownSync(Route)({
 *   upstream: "https://mcp.context7.com/mcp",
 *   secretId: "CONTEXT7_MCP_AUTHORIZATION"
 * })
 *
 * const headers = outboundHeaders(
 *   { host: "127.0.0.1:18890", connection: "keep-alive", accept: "application/json" },
 *   route,
 *   "Bearer from-the-vault",
 *   "mcp.context7.com",
 *   0
 * )
 *
 * assert.strictEqual(headers["Host"], "mcp.context7.com")
 * assert.strictEqual(headers["Authorization"], "Bearer from-the-vault")
 * assert.strictEqual(headers["accept"], "application/json")
 *
 * // The hop-by-hop header and the empty body's length are both dropped.
 * assert.strictEqual("connection" in headers, false)
 * assert.strictEqual("Content-Length" in headers, false)
 *
 * @returns the headers to send upstream
 */
export const outboundHeaders = (
  inbound: Readonly<Record<string, string | ReadonlyArray<string> | undefined>>,
  route: Route,
  secret: string,
  upstreamHost: string,
  bodyLength: number
): Record<string, string> => {
  const headers: Record<string, string> = {}
  for (const [name, value] of Object.entries(inbound)) {
    const lower = name.toLowerCase()
    if (HOP_BY_HOP.has(lower) || lower === "host" || lower === "content-length") {
      continue
    }
    if (value === undefined) continue
    headers[name] = Array.isArray(value) ? value.join(", ") : String(value)
  }
  headers["Host"] = upstreamHost
  headers[route.header] = secret
  if (bodyLength > 0) headers["Content-Length"] = String(bodyLength)
  return headers
}

/**
 * The method of an inbound request, defaulting to GET.
 *
 * Node types `method` as optional even though a served request always has one,
 * so the default exists to satisfy the type rather than to describe real
 * traffic - and is covered here rather than left as an untested branch.
 *
 * @remarks
 * Pure and total. Node types `method` as optional even though a served
 * request always has one, so the default satisfies the type rather than
 * describing real traffic.
 *
 * @param request - the inbound request
 * @returns the HTTP method to forward
 *
 * @example
 * import { requestMethod } from "@resnovas/opp-mcp-auth-proxy/routing"
 *
 * assert.strictEqual(requestMethod({ method: "POST" }), "POST")
 * assert.strictEqual(requestMethod({}), "GET")
 */
export const requestMethod = (request: { readonly method?: string | undefined }): string =>
  request.method ?? "GET"

/**
 * The URL of an inbound request, defaulting to the root path.
 *
 * @remarks
 * Pure and total, defaulting to the root path for the same reason as
 * `requestMethod`.
 *
 * @param request - the inbound request
 * @returns the path to match against the route table
 *
 * @example
 * import { requestUrl } from "@resnovas/opp-mcp-auth-proxy/routing"
 *
 * assert.strictEqual(requestUrl({ url: "/context7" }), "/context7")
 * assert.strictEqual(requestUrl({}), "/")
 */
export const requestUrl = (request: { readonly url?: string | undefined }): string =>
  request.url ?? "/"

/**
 * The headers to send back to the client from an upstream response.
 *
 * Content-Length is dropped because the body may be an open event stream of
 * unknown length, so framing is "read until close" instead.
 *
 * @remarks
 * Pure and total. Drops `Content-Length`, because the body may be an open
 * event stream of unknown length, and sets `Connection: close` so framing
 * becomes read-until-close.
 *
 * @param headers - the upstream response headers
 * @returns the headers to write on the downstream response
 *
 * @example
 * import { relayHeaders } from "@resnovas/opp-mcp-auth-proxy/routing"
 *
 * const headers = relayHeaders([
 *   ["content-type", "text/event-stream"],
 *   ["content-length", "42"]
 * ])
 *
 * assert.strictEqual(headers["content-type"], "text/event-stream")
 *
 * // Dropped, because an open event stream has no length to declare; framing
 * // becomes read-until-close.
 * assert.strictEqual("content-length" in headers, false)
 * assert.strictEqual(headers["Connection"], "close")
 */
export const relayHeaders = (headers: Iterable<readonly [string, string]>): Record<string, string> => {
  const relayed: Record<string, string> = {}
  for (const [name, value] of headers) {
    if (name.toLowerCase() === "content-length") continue
    relayed[name] = value
  }
  relayed["Connection"] = "close"
  return relayed
}
