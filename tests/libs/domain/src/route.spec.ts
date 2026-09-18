/*
 * Project: openclaw-proton-pass
 * File: route.spec.ts
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
import { ListenAddress, ProxyConfig, splitAddress } from "@resnovas/opp-domain"
import { Either, Schema } from "effect"

const decodeAddress = Schema.decodeUnknownEither(ListenAddress)
const decodeConfig = Schema.decodeUnknownEither(ProxyConfig)

describe("ListenAddress", () => {
  it.each(["127.0.0.1:18890", "localhost:1", "::1:65535"])(
    "accepts the loopback address %s",
    (address) => {
      expect(Either.isRight(decodeAddress(address))).toBe(true)
    }
  )

  it.each(["0.0.0.0:18890", "192.168.1.10:18890", "example.com:80"])(
    "refuses %s, which would expose an unauthenticated credentialed route",
    (address) => {
      expect(Either.isLeft(decodeAddress(address))).toBe(true)
    }
  )

  it("rejects a missing port", () => {
    expect(Either.isLeft(decodeAddress("127.0.0.1"))).toBe(true)
  })

  it.each(["127.0.0.1:0", "127.0.0.1:65536", "127.0.0.1:http"])(
    "rejects the invalid port in %s",
    (address) => {
      expect(Either.isLeft(decodeAddress(address))).toBe(true)
    }
  )
})

describe("splitAddress", () => {
  it("splits host from port", () => {
    expect(splitAddress("127.0.0.1:18890" as ListenAddress)).toEqual({
      host: "127.0.0.1",
      port: 18890
    })
  })

  it("splits an IPv6 loopback on the last colon", () => {
    expect(splitAddress("::1:9000" as ListenAddress)).toEqual({ host: "::1", port: 9000 })
  })
})

describe("ProxyConfig", () => {
  it("defaults the listen address and per-route fields", () => {
    const result = decodeConfig({
      routes: { "/example": { upstream: "https://mcp.example.com/mcp", secretId: "S" } }
    })
    expect(Either.isRight(result)).toBe(true)
    if (Either.isRight(result)) {
      expect(result.right.listen).toBe("127.0.0.1:18890")
      expect(result.right.routes["/example"]?.header).toBe("Authorization")
      expect(result.right.routes["/example"]?.timeoutSeconds).toBe(120)
    }
  })

  it("rejects an upstream that is not an http(s) URL", () => {
    const result = decodeConfig({
      routes: { "/x": { upstream: "ftp://example.com", secretId: "S" } }
    })
    expect(Either.isLeft(result)).toBe(true)
  })

  it("rejects a non-positive timeout", () => {
    const result = decodeConfig({
      routes: {
        "/x": { upstream: "https://e.com", secretId: "S", timeoutSeconds: 0 }
      }
    })
    expect(Either.isLeft(result)).toBe(true)
  })
})
