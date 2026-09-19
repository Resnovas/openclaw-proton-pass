/*
 * Project: openclaw-proton-pass
 * File: doctor.spec.ts
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
import { Effect, Layer } from "effect"
import { mkdirSync, rmSync } from "node:fs"
import { doctor, renderChecks } from "../../../../apps/cli/src/doctor.js"
import { makeWorkspace, type Workspace } from "../../../helpers/workspace.js"

let workspace: Workspace | undefined

afterEach(() => {
  workspace?.dispose()
  workspace = undefined
})

const layer = Layer.provideMerge(
  Layer.mergeAll(Paths.Default, Telemetry.Default),
  NodeContext.layer
)
const run = () => Effect.runPromise(doctor.pipe(Effect.provide(layer)))

describe("renderChecks", () => {
  it("marks a passing check", () => {
    expect(renderChecks([{ label: "thing", ok: true }])[0]).toContain("ok")
  })

  it("marks a failing check", () => {
    expect(renderChecks([{ label: "thing", ok: false }])[0]).toContain("MISS")
  })

  it("appends the remedy when a check carries one", () => {
    const line = renderChecks([{ label: "token", ok: false, detail: "create it" }])[0]
    expect(line).toContain("create it")
  })

  it("omits the separator when there is no detail", () => {
    // The separator is " - ", spaces included, so a label that contains a
    // hyphen of its own is not mistaken for one.
    expect(renderChecks([{ label: "plain-label", ok: true }])[0]).not.toContain(" - ")
  })

  it("renders one line per check", () => {
    expect(renderChecks([
      { label: "a", ok: true },
      { label: "b", ok: false }
    ])).toHaveLength(2)
  })
})

describe("doctor", () => {
  it("reports everything present in a complete workspace", async () => {
    workspace = makeWorkspace({ secretMap: "{}", proxyConfig: "{}" })
    mkdirSync(workspace.sessionDir, { recursive: true })
    const checks = await run()
    expect(checks.every((check) => check.ok)).toBe(true)
  })

  it("reports the missing agent token with its remedy", async () => {
    workspace = makeWorkspace({ secretMap: "{}", proxyConfig: "{}", agentToken: null })
    const checks = await run()
    const token = checks.find((check) => check.label.includes("agent token"))
    expect(token?.ok).toBe(false)
    expect(token?.detail).toContain("pass-cli agent create")
  })

  it("reports a missing secret map", async () => {
    workspace = makeWorkspace({ proxyConfig: "{}" })
    const checks = await run()
    expect(checks.find((check) => check.label.includes("secret map"))?.ok).toBe(false)
  })

  it("reports a missing proxy route file", async () => {
    workspace = makeWorkspace({ secretMap: "{}" })
    expect((await run()).find((check) => check.label.includes("proxy routes"))?.ok).toBe(false)
  })

  it("reports a missing session directory", async () => {
    workspace = makeWorkspace({ secretMap: "{}", proxyConfig: "{}" })
    rmSync(workspace.sessionDir, { recursive: true, force: true })
    expect((await run()).find((check) => check.label.includes("session"))?.ok).toBe(false)
  })

  it("changes nothing it reports on", async () => {
    // doctor must be safe to run against a production host.
    workspace = makeWorkspace({ secretMap: "{}" })
    await run()
    const again = await run()
    expect(again.find((check) => check.label.includes("proxy routes"))?.ok).toBe(false)
  })
})
