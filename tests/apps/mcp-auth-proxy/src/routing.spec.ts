/*
 * Project: openclaw-proton-pass
 * File: routing.spec.ts
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

import { describe, expect, it } from "@effect/vitest"
import type { ProxyConfig, Route, SecretId } from "@resnovas/opp-domain"
import { Option } from "effect"
import {
  HOP_BY_HOP,
  matchRoute,
  outboundHeaders,
  relayHeaders,
  requestMethod,
  requestUrl
} from "../../../../apps/mcp-auth-proxy/src/routing.js"

const route: Route = {
  upstream: "https://mcp.example.com/mcp",
  header: "Authorization",
  secretId: "EXAMPLE" as SecretId,
  timeoutSeconds: 120
}

const config = { listen: "127.0.0.1:18890", routes: { "/example": route } } as ProxyConfig

describe("matchRoute", () => {
  it("matches an exact path", () => {
    expect(Option.isSome(matchRoute(config, "/example"))).toBe(true)
  })

  it("ignores a trailing slash", () => {
    expect(Option.isSome(matchRoute(config, "/example/"))).toBe(true)
  })

  it("ignores the query string", () => {
    expect(Option.isSome(matchRoute(config, "/example?sessionId=abc"))).toBe(true)
  })

  it("returns none for an unknown path", () => {
    expect(Option.isNone(matchRoute(config, "/nope"))).toBe(true)
  })

  it("returns none for the root when no root route exists", () => {
    expect(Option.isNone(matchRoute(config, "/"))).toBe(true)
  })
})

describe("outboundHeaders", () => {
  it("sets the credential header from the resolved secret", () => {
    const headers = outboundHeaders({}, route, "Bearer tok", "mcp.example.com", 0)
    expect(headers["Authorization"]).toBe("Bearer tok")
  })

  it("rewrites Host to the upstream", () => {
    const headers = outboundHeaders(
      { host: "127.0.0.1:18890" },
      route,
      "Bearer tok",
      "mcp.example.com",
      0
    )
    expect(headers["Host"]).toBe("mcp.example.com")
  })

  it.each([...HOP_BY_HOP])("drops the hop-by-hop header %s", (name) => {
    const headers = outboundHeaders({ [name]: "x" }, route, "t", "h", 0)
    expect(Object.keys(headers).map((key) => key.toLowerCase())).not.toContain(name)
  })

  it("restates Content-Length for the body actually forwarded", () => {
    const headers = outboundHeaders({ "content-length": "999" }, route, "t", "h", 12)
    expect(headers["Content-Length"]).toBe("12")
  })

  it("omits Content-Length for an empty body", () => {
    const headers = outboundHeaders({}, route, "t", "h", 0)
    expect(headers["Content-Length"]).toBeUndefined()
  })

  it("passes an unrelated header through", () => {
    const headers = outboundHeaders({ accept: "text/event-stream" }, route, "t", "h", 0)
    expect(headers["accept"]).toBe("text/event-stream")
  })

  it("overwrites a client-supplied credential header rather than trusting it", () => {
    const headers = outboundHeaders(
      { Authorization: "Bearer attacker" },
      route,
      "Bearer real",
      "h",
      0
    )
    expect(headers["Authorization"]).toBe("Bearer real")
  })
})

describe("matchRoute edge cases", () => {
  it("falls back to the root path for an empty URL", () => {
    // An empty request URL must not throw; with no root route it matches none.
    expect(Option.isNone(matchRoute(config, ""))).toBe(true)
  })

  it("matches a configured root route for an empty URL", () => {
    const rooted = { listen: "127.0.0.1:18890", routes: { "/": route } } as unknown as ProxyConfig
    expect(Option.isSome(matchRoute(rooted, ""))).toBe(true)
  })

  it("matches a route whose key carries a trailing slash", () => {
    const slashed = {
      listen: "127.0.0.1:18890",
      routes: { "/example/": route }
    } as unknown as ProxyConfig
    expect(Option.isSome(matchRoute(slashed, "/example"))).toBe(true)
  })

  it("collapses repeated trailing slashes", () => {
    expect(Option.isSome(matchRoute(config, "/example///"))).toBe(true)
  })

  it("matches a root route when one is configured", () => {
    const rooted = { listen: "127.0.0.1:18890", routes: { "/": route } } as unknown as ProxyConfig
    expect(Option.isSome(matchRoute(rooted, "/"))).toBe(true)
  })
})

describe("outboundHeaders edge cases", () => {
  it("joins a repeated header into one value", () => {
    const headers = outboundHeaders({ accept: ["a", "b"] }, route, "t", "h", 0)
    expect(headers["accept"]).toBe("a, b")
  })

  it("skips a header whose value is undefined", () => {
    const headers = outboundHeaders({ absent: undefined }, route, "t", "h", 0)
    expect(Object.hasOwn(headers, "absent")).toBe(false)
  })

  it("uses the route's custom header name", () => {
    const custom = { ...route, header: "X-Api-Key" }
    const headers = outboundHeaders({}, custom, "secret", "h", 0)
    expect(headers["X-Api-Key"]).toBe("secret")
    expect(headers["Authorization"]).toBeUndefined()
  })
})

describe("requestMethod", () => {
  it("uses the method the client sent", () => {
    expect(requestMethod({ method: "POST" })).toBe("POST")
  })

  it("defaults to GET when Node reports no method", () => {
    expect(requestMethod({})).toBe("GET")
  })

  it("treats an explicit undefined as absent", () => {
    expect(requestMethod({ method: undefined })).toBe("GET")
  })
})

describe("requestUrl", () => {
  it("uses the URL the client sent", () => {
    expect(requestUrl({ url: "/example" })).toBe("/example")
  })

  it("defaults to the root path when there is none", () => {
    expect(requestUrl({})).toBe("/")
  })

  it("treats an explicit undefined as absent", () => {
    expect(requestUrl({ url: undefined })).toBe("/")
  })
})

describe("relayHeaders", () => {
  it("passes an ordinary header through", () => {
    expect(relayHeaders([["content-type", "application/json"]])["content-type"]).toBe(
      "application/json"
    )
  })

  it("drops Content-Length, because the body may be an open stream", () => {
    const relayed = relayHeaders([["Content-Length", "42"]])
    expect(relayed["Content-Length"]).toBeUndefined()
  })

  it("drops Content-Length whatever its casing", () => {
    expect(relayHeaders([["content-length", "42"]])["content-length"]).toBeUndefined()
  })

  it("always closes the connection, so framing is read-until-close", () => {
    expect(relayHeaders([])["Connection"]).toBe("close")
  })

  it("keeps every other header alongside Connection", () => {
    const relayed = relayHeaders([
      ["content-type", "text/event-stream"],
      ["content-length", "9"],
      ["cache-control", "no-cache"]
    ])
    expect(Object.keys(relayed).sort()).toEqual(["Connection", "cache-control", "content-type"])
  })
})
