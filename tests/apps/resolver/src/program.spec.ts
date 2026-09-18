/*
 * Project: openclaw-proton-pass
 * File: program.spec.ts
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

import { afterEach, describe, expect, it } from "@effect/vitest"
import { NodeContext } from "@effect/platform-node"
import { Paths } from "@resnovas/opp-config"
import { PROTOCOL_VERSION, type ResolveRequest, type SecretId } from "@resnovas/opp-domain"
import { PassSession, SecretResolver } from "@resnovas/opp-pass-cli"
import { Telemetry } from "@resnovas/opp-telemetry"
import { Effect, Exit, Layer } from "effect"
import { handle, parseRequest, protocolFailure } from "../../../../apps/resolver/src/program.js"
import { makeWorkspace, type StubBehaviour, type Workspace } from "../../../helpers/workspace.js"

let workspace: Workspace | undefined

afterEach(() => {
  workspace?.dispose()
  workspace = undefined
})

const layer = Layer.mergeAll(
  SecretResolver.Default,
  PassSession.Default,
  Telemetry.Default,
  Paths.Default
).pipe(Layer.provideMerge(NodeContext.layer))

const setup = (secretMap: string, stub: StubBehaviour = {}) => {
  workspace = makeWorkspace({ secretMap, stub })
}

const request = (ids: ReadonlyArray<string>): ResolveRequest => ({
  protocolVersion: PROTOCOL_VERSION,
  ids: ids as ReadonlyArray<SecretId>
})

describe("parseRequest", () => {
  it.effect("decodes a well-formed request", () =>
    Effect.gen(function* () {
      const parsed = yield* parseRequest('{"protocolVersion":1,"ids":["A"]}')
      expect(parsed.ids).toEqual(["A"])
    })
  )

  it.effect("defaults ids when the Gateway omits them", () =>
    Effect.gen(function* () {
      const parsed = yield* parseRequest('{"protocolVersion":1}')
      expect(parsed.ids).toEqual([])
    })
  )

  it.effect("fails with ProtocolError on malformed JSON", () =>
    Effect.gen(function* () {
      const result = yield* parseRequest("{ nope").pipe(Effect.exit)
      expect(Exit.isFailure(result)).toBe(true)
      expect(JSON.stringify(result)).toContain("could not parse request")
    })
  )

  it.effect("fails with ProtocolError when the schema rejects the request", () =>
    Effect.gen(function* () {
      const result = yield* parseRequest('{"protocolVersion":7}').pipe(Effect.exit)
      expect(Exit.isFailure(result)).toBe(true)
      expect(JSON.stringify(result)).toContain("ProtocolError")
    })
  )
})

describe("protocolFailure", () => {
  it("renders a protocol-level failure", () => {
    expect(protocolFailure("boom")).toEqual({ protocolVersion: 1, error: "boom" })
  })

  it("always carries the protocol version", () => {
    expect(protocolFailure("x").protocolVersion).toBe(PROTOCOL_VERSION)
  })
})

describe("handle", () => {
  it.effect("returns values for resolvable ids", () =>
    Effect.gen(function* () {
      setup('{"A":"pass://V/i/f"}', { values: ["secret"] })
      const response = yield* handle(request(["A"])).pipe(Effect.provide(layer))
      expect(response.values).toEqual({ A: "secret" })
      expect(response.errors).toBeUndefined()
    })
  )

  it.effect("reports an unknown id under errors, not as a failure", () =>
    Effect.gen(function* () {
      setup('{"A":"pass://V/i/f"}', { values: ["secret"] })
      const response = yield* handle(request(["NOPE"])).pipe(Effect.provide(layer))
      expect(response.errors).toEqual({ NOPE: "NOT_FOUND" })
    })
  )

  it.effect("returns both values and errors for a mixed batch", () =>
    Effect.gen(function* () {
      setup('{"A":"pass://V/i/f"}', { values: ["secret"] })
      const response = yield* handle(request(["A", "NOPE"])).pipe(Effect.provide(layer))
      expect(response.values).toEqual({ A: "secret" })
      expect(response.errors).toEqual({ NOPE: "NOT_FOUND" })
    })
  )

  it.effect("answers an empty request without contacting the vault", () =>
    Effect.gen(function* () {
      setup('{"A":"pass://V/i/f"}')
      const response = yield* handle(request([])).pipe(Effect.provide(layer))
      expect(response.values).toEqual({})
    })
  )

  it.effect("turns a resolution failure into a protocol-level error", () =>
    Effect.gen(function* () {
      // The map is absent, so resolution fails outright. The Gateway still
      // receives a well-formed response rather than a crash.
      workspace = makeWorkspace({})
      const response = yield* handle(request(["A"])).pipe(Effect.provide(layer))
      expect(response.error).toContain("resolution failed")
      expect(response.values).toBeUndefined()
    })
  )

  it.effect("applies decoration from the secret map", () =>
    Effect.gen(function* () {
      setup('{"A":{"ref":"pass://V/i/f","prefix":"Bearer "}}', { values: ["tok"] })
      const response = yield* handle(request(["A"])).pipe(Effect.provide(layer))
      expect(response.values).toEqual({ A: "Bearer tok" })
    })
  )
})
