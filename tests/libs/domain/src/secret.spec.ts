/*
 * Project: openclaw-proton-pass
 * File: secret.spec.ts
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
import {
  decorate,
  normaliseEntry,
  PassRef,
  SecretId,
  SecretMap,
  type SecretMapEntry
} from "@resnovas/opp-domain"
import { Effect, Either, Schema } from "effect"

const decodeRef = Schema.decodeUnknownEither(PassRef)
const decodeId = Schema.decodeUnknownEither(SecretId)
const decodeMap = Schema.decodeUnknownEither(SecretMap)

describe("SecretId", () => {
  it("accepts a non-empty name", () => {
    expect(Either.isRight(decodeId("DEX_API_KEY"))).toBe(true)
  })

  it("rejects an empty name, which would silently match nothing", () => {
    expect(Either.isLeft(decodeId(""))).toBe(true)
  })
})

describe("PassRef", () => {
  it("accepts a pass:// reference", () => {
    expect(Either.isRight(decodeRef("pass://OpenClaw/example.com/API Key"))).toBe(true)
  })

  it("rejects a bare string, so a literal secret cannot pose as a reference", () => {
    expect(Either.isLeft(decodeRef("sk-live-actually-a-secret"))).toBe(true)
  })

  it("rejects another scheme", () => {
    expect(Either.isLeft(decodeRef("https://example.com/key"))).toBe(true)
  })
})

describe("SecretMap", () => {
  it("accepts both the bare and decorated entry shapes", () => {
    const result = decodeMap({
      BARE: "pass://OpenClaw/example.com/API Key",
      DECORATED: { ref: "pass://OpenClaw/example.com/API Key", prefix: "Bearer " }
    })
    expect(Either.isRight(result)).toBe(true)
  })

  it("rejects an entry whose ref is not a reference", () => {
    expect(Either.isLeft(decodeMap({ BAD: { ref: "not-a-ref" } }))).toBe(true)
  })

  it("defaults prefix and suffix to empty", () => {
    const result = decodeMap({ D: { ref: "pass://V/i/f" } })
    expect(Either.isRight(result)).toBe(true)
    if (Either.isRight(result)) {
      const entry = result.right["D"] as Exclude<SecretMapEntry, string>
      expect(entry.prefix).toBe("")
      expect(entry.suffix).toBe("")
    }
  })
})

describe("normaliseEntry", () => {
  it("treats a bare reference as undecorated", () => {
    const ref = "pass://V/i/f" as PassRef
    expect(normaliseEntry(ref)).toEqual({ ref, prefix: "", suffix: "" })
  })

  it("preserves decoration", () => {
    const entry = { ref: "pass://V/i/f" as PassRef, prefix: "Bearer ", suffix: "!" }
    expect(normaliseEntry(entry)).toEqual(entry)
  })
})

describe("decorate", () => {
  it("wraps a value in its prefix and suffix", () => {
    const entry = { ref: "pass://V/i/f" as PassRef, prefix: "Bearer ", suffix: "" }
    expect(decorate(entry, "token")).toBe("Bearer token")
  })

  it("leaves a bare entry's value untouched", () => {
    expect(decorate("pass://V/i/f" as PassRef, "token")).toBe("token")
  })

  it.effect("composes with an effectful caller", () =>
    Effect.gen(function* () {
      const value = yield* Effect.succeed("token")
      expect(decorate("pass://V/i/f" as PassRef, value)).toBe("token")
    })
  )
})
