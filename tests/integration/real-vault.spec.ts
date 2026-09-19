/*
 * Project: openclaw-proton-pass
 * File: real-vault.spec.ts
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
import { execFile } from "node:child_process"
import { fileURLToPath } from "node:url"

/**
 * Integration coverage against a real Proton Pass vault.
 *
 * Skipped unless `OPP_INTEGRATION_SECRET_ID` names an id present in the local
 * secret map. Requiring the id to be named, rather than discovering one, means
 * the suite can never read from a vault by accident on a developer's machine or
 * in CI.
 *
 *   OPP_INTEGRATION_SECRET_ID=SOME_ID pnpm test tests/integration
 *
 * No test here prints a resolved value. Assertions are on length and shape, so
 * a failure message cannot leak a credential into CI logs.
 */
const secretId = process.env["OPP_INTEGRATION_SECRET_ID"]
const decoratedId = process.env["OPP_INTEGRATION_DECORATED_ID"]

const RESOLVER = fileURLToPath(
  new URL("../../apps/resolver/dist/main.js", import.meta.url)
)

const resolve = (ids: ReadonlyArray<string>): Promise<{
  values: Record<string, string>
  errors: Record<string, string>
  error?: string
  code: number
}> =>
  new Promise((resolve) => {
    const child = execFile(
      process.execPath,
      [RESOLVER],
      { env: process.env, timeout: 120_000 },
      (error, stdout) => {
        const parsed = JSON.parse(stdout) as {
          values?: Record<string, string>
          errors?: Record<string, string>
          error?: string
        }
        resolve({
          values: parsed.values ?? {},
          errors: parsed.errors ?? {},
          ...(parsed.error === undefined ? {} : { error: parsed.error }),
          code: error && typeof error.code === "number" ? error.code : 0
        })
      }
    )
    child.stdin?.end(JSON.stringify({ protocolVersion: 1, provider: "protonpass", ids }))
  })

describe.skipIf(secretId === undefined)("resolver against a real vault", () => {
  it("resolves a real secret to a non-empty value", async () => {
    const result = await resolve([secretId!])
    expect(result.error).toBeUndefined()
    expect(result.code).toBe(0)
    // Length only: the value itself never reaches the assertion output.
    expect(result.values[secretId!]?.length ?? 0).toBeGreaterThan(0)
  }, 120_000)

  it("reports an unknown id as NOT_FOUND alongside a real one", async () => {
    const result = await resolve([secretId!, "DEFINITELY_NOT_IN_THE_MAP"])
    expect(result.values[secretId!]?.length ?? 0).toBeGreaterThan(0)
    expect(result.errors["DEFINITELY_NOT_IN_THE_MAP"]).toBe("NOT_FOUND")
  }, 120_000)

  it("answers an empty request without touching the vault", async () => {
    const result = await resolve([])
    expect(result.values).toEqual({})
    expect(result.code).toBe(0)
  }, 30_000)

  it("recovers a session it had to rebuild", async () => {
    // Two consecutive resolutions: the first may repair an unusable session,
    // the second must succeed against the session the first established.
    const first = await resolve([secretId!])
    const second = await resolve([secretId!])
    expect(first.values[secretId!]?.length).toBe(second.values[secretId!]?.length)
  }, 180_000)
})

describe.skipIf(decoratedId === undefined || secretId === undefined)(
  "decoration against a real vault",
  () => {
    it("applies the map's prefix to the resolved value", async () => {
      // The decorated entry references the same item as the bare one, so the
      // difference in length is exactly the prefix the map adds.
      const result = await resolve([secretId!, decoratedId!])
      const bare = result.values[secretId!] ?? ""
      const decorated = result.values[decoratedId!] ?? ""
      expect(bare.length).toBeGreaterThan(0)
      expect(decorated.length).toBeGreaterThan(bare.length)
      expect(decorated.endsWith(bare)).toBe(true)
    }, 120_000)
  }
)
