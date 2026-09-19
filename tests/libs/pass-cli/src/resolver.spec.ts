/*
 * Project: openclaw-proton-pass
 * File: resolver.spec.ts
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
import { Telemetry } from "@resnovas/opp-telemetry"
import type { SecretId } from "@resnovas/opp-domain"
import { SecretResolver } from "@resnovas/opp-pass-cli"
import { Effect, Exit, Layer, Redacted } from "effect"
import { readFileSync } from "node:fs"
import { makeWorkspace, type StubBehaviour, type Workspace } from "../../../helpers/workspace.js"

let workspace: Workspace | undefined

afterEach(() => {
  workspace?.dispose()
  workspace = undefined
})

const layer = Layer.provideMerge(
  SecretResolver.Default,
  Layer.provideMerge(
    Layer.mergeAll(Paths.Default, Telemetry.Default),
    NodeContext.layer
  )
)

const id = (name: string) => name as SecretId

const resolving = (ids: ReadonlyArray<SecretId>) =>
  Effect.gen(function* () {
    const resolver = yield* SecretResolver
    return yield* resolver.resolve(ids, { binary: "resolver" })
  }).pipe(Effect.provide(layer), Effect.exit)

const loading = Effect.gen(function* () {
  const resolver = yield* SecretResolver
  return yield* resolver.loadMap
}).pipe(Effect.provide(layer), Effect.exit)

const setup = (secretMap: string, stub: StubBehaviour = {}) => {
  workspace = makeWorkspace({ secretMap, stub })
  return workspace
}

describe("SecretResolver.loadMap", () => {
  it.effect("reads a valid map", () =>
    Effect.gen(function* () {
      setup('{"A":"pass://V/i/f"}')
      const result = yield* loading
      expect(Exit.isSuccess(result)).toBe(true)
    })
  )

  it.effect("fails with SecretMapError when the file is absent", () =>
    Effect.gen(function* () {
      const ws = makeWorkspace({})
      workspace = ws
      const result = yield* loading
      expect(JSON.stringify(result)).toContain("SecretMapError")
    })
  )

  it.effect("fails with SecretMapError on invalid JSON", () =>
    Effect.gen(function* () {
      setup("{ this is not json")
      const result = yield* loading
      expect(JSON.stringify(result)).toContain("invalid JSON")
    })
  )

  it.effect("fails with SecretMapError when an entry breaks the schema", () =>
    Effect.gen(function* () {
      setup('{"A":"definitely-not-a-pass-reference"}')
      const result = yield* loading
      expect(JSON.stringify(result)).toContain("SecretMapError")
    })
  )
})

describe("the reason recorded against a read", () => {
  const inherited = process.env["OPENCLAW_PROTONPASS_AUDIT_LABEL"]

  afterEach(() => {
    if (inherited === undefined) delete process.env["OPENCLAW_PROTONPASS_AUDIT_LABEL"]
    else process.env["OPENCLAW_PROTONPASS_AUDIT_LABEL"] = inherited
  })

  it.effect("reaches pass-cli naming the ids being read", () =>
    Effect.gen(function* () {
      // Without this the audit log records that a credential was taken and
      // nothing about which one, which is most of its value gone.
      setup('{"OPENAI_API_KEY":"pass://V/openai/key"}')
      delete process.env["OPENCLAW_PROTONPASS_AUDIT_LABEL"]
      yield* resolving([id("OPENAI_API_KEY")])
      expect(readFileSync(workspace!.runReason, "utf8")).toBe(
        "OpenClaw resolver reading OPENAI_API_KEY"
      )
    })
  )

  it.effect("carries the operator's label through to the vault", () =>
    Effect.gen(function* () {
      // The only route by which an agent or task name can reach the audit
      // log, because OpenClaw tells an exec provider nothing about either.
      setup('{"OPENAI_API_KEY":"pass://V/openai/key"}')
      process.env["OPENCLAW_PROTONPASS_AUDIT_LABEL"] = "nightly summariser"
      yield* resolving([id("OPENAI_API_KEY")])
      expect(readFileSync(workspace!.runReason, "utf8")).toBe(
        "OpenClaw resolver reading OPENAI_API_KEY (nightly summariser)"
      )
    })
  )

  it.effect("names only ids that are in the map", () =>
    Effect.gen(function* () {
      // An id the map does not hold never reaches the vault, so recording it
      // as read would be a false entry in an audit log.
      setup('{"OPENAI_API_KEY":"pass://V/openai/key"}')
      delete process.env["OPENCLAW_PROTONPASS_AUDIT_LABEL"]
      yield* resolving([id("OPENAI_API_KEY"), id("NOT_IN_THE_MAP")])
      expect(readFileSync(workspace!.runReason, "utf8")).not.toContain("NOT_IN_THE_MAP")
    })
  )
})

describe("SecretResolver.resolve", () => {
  it.effect("returns nothing for no ids, without touching the vault", () =>
    Effect.gen(function* () {
      setup('{"A":"pass://V/i/f"}')
      const result = yield* resolving([])
      expect(Exit.isSuccess(result)).toBe(true)
      if (Exit.isSuccess(result)) expect(result.value.size).toBe(0)
    })
  )

  it.effect("reports an id absent from the map as NotFound", () =>
    Effect.gen(function* () {
      setup('{"A":"pass://V/i/f"}')
      const result = yield* resolving([id("MISSING")])
      if (Exit.isSuccess(result)) {
        expect(result.value.get(id("MISSING"))).toEqual({ _tag: "NotFound" })
      }
    })
  )

  it.effect("resolves a known id to its value", () =>
    Effect.gen(function* () {
      setup('{"A":"pass://V/i/f"}', { values: ["the-secret"] })
      const result = yield* resolving([id("A")])
      expect(Exit.isSuccess(result)).toBe(true)
      if (Exit.isSuccess(result)) {
        const outcome = result.value.get(id("A"))
        expect(outcome?._tag).toBe("Value")
        if (outcome?._tag === "Value") {
          expect(Redacted.value(outcome.value)).toBe("the-secret")
        }
      }
    })
  )

  it.effect("applies the entry's prefix to the resolved value", () =>
    Effect.gen(function* () {
      setup('{"A":{"ref":"pass://V/i/f","prefix":"Bearer "}}', { values: ["tok"] })
      const result = yield* resolving([id("A")])
      if (Exit.isSuccess(result)) {
        const outcome = result.value.get(id("A"))
        if (outcome?._tag === "Value") {
          expect(Redacted.value(outcome.value)).toBe("Bearer tok")
        }
      }
    })
  )

  it.effect("applies a suffix as well", () =>
    Effect.gen(function* () {
      setup('{"A":{"ref":"pass://V/i/f","suffix":"!"}}', { values: ["tok"] })
      const result = yield* resolving([id("A")])
      if (Exit.isSuccess(result)) {
        const outcome = result.value.get(id("A"))
        if (outcome?._tag === "Value") expect(Redacted.value(outcome.value)).toBe("tok!")
      }
    })
  )

  it.effect("mixes resolved and missing ids in one batch", () =>
    Effect.gen(function* () {
      // One unknown id must not deny the Gateway every other secret.
      setup('{"A":"pass://V/i/f"}', { values: ["v"] })
      const result = yield* resolving([id("A"), id("NOPE")])
      if (Exit.isSuccess(result)) {
        expect(result.value.get(id("A"))?._tag).toBe("Value")
        expect(result.value.get(id("NOPE"))?._tag).toBe("NotFound")
      }
    })
  )

  it.effect("treats an empty resolved value as NotFound", () =>
    Effect.gen(function* () {
      // An unresolved reference comes back empty rather than failing.
      setup('{"A":"pass://V/i/f"}', { values: [""] })
      const result = yield* resolving([id("A")])
      if (Exit.isSuccess(result)) {
        expect(result.value.get(id("A"))?._tag).toBe("NotFound")
      }
    })
  )

  it.effect("treats a short result as NotFound for the unmatched id", () =>
    Effect.gen(function* () {
      setup('{"A":"pass://V/i/f","B":"pass://V/i/g"}', { values: ["only-one"] })
      const result = yield* resolving([id("A"), id("B")])
      if (Exit.isSuccess(result)) {
        expect(result.value.get(id("A"))?._tag).toBe("Value")
        expect(result.value.get(id("B"))?._tag).toBe("NotFound")
      }
    })
  )

  it.effect("fails with ResolutionError when pass-cli run exits non-zero", () =>
    Effect.gen(function* () {
      setup('{"A":"pass://V/i/f"}', { runExit: 3 })
      const result = yield* resolving([id("A")])
      expect(Exit.isFailure(result)).toBe(true)
      expect(JSON.stringify(result)).toContain("ResolutionError")
    })
  )

  // it.live, not it.effect: it.effect installs a virtual TestClock, under which
  // Effect.timeout never fires because time does not advance on its own.
  it.live("wraps a timed-out vault call as ResolutionError", () =>
    Effect.gen(function* () {
      // A hung vault call must not pin the Gateway open; the bound turns it
      // into an ordinary typed failure.
      setup('{"A":"pass://V/i/f"}', { runDelaySeconds: 1 })
      process.env["OPENCLAW_PROTONPASS_TIMEOUT_MS"] = "50"
      const result = yield* resolving([id("A")])
      delete process.env["OPENCLAW_PROTONPASS_TIMEOUT_MS"]
      expect(Exit.isFailure(result)).toBe(true)
      expect(JSON.stringify(result)).toContain("ResolutionError")
    }),
    15_000
  )

  it.effect("propagates a session failure rather than returning empty values", () =>
    Effect.gen(function* () {
      workspace = makeWorkspace({
        secretMap: '{"A":"pass://V/i/f"}',
        agentToken: null,
        stub: { infoExit: 1 }
      })
      const result = yield* resolving([id("A")])
      expect(Exit.isFailure(result)).toBe(true)
      expect(JSON.stringify(result)).toContain("MissingAgentTokenError")
    })
  )
})
