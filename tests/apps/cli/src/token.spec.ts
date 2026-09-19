/*
 * Project: openclaw-proton-pass
 * File: token.spec.ts
 * Last Modified: 2026-09-19
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
import { Effect, Exit, Layer } from "effect"
import { readFileSync, rmSync, statSync } from "node:fs"
import { parseToken, storeToken } from "../../../../apps/cli/src/token.js"
import { withFailingStdin, withStdin } from "../../../helpers/process.js"
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
const run = () => Effect.runPromiseExit(storeToken.pipe(Effect.provide(layer)))

describe("parseToken", () => {
  it("trims the newline a pipe adds", () => {
    // Invisible in a terminal, and pass-cli rejects the token with an
    // authentication error rather than a parse error, which sends the reader
    // looking in the wrong place entirely.
    expect(parseToken("pat_abc123\n")).toBe("pat_abc123")
    expect(parseToken("  pat_abc123  ")).toBe("pat_abc123")
  })

  it("reports nothing when the input is empty", () => {
    expect(parseToken("")).toBeUndefined()
    expect(parseToken("   \n\n ")).toBeUndefined()
  })

  it("refuses input holding more than one line", () => {
    // Several lines means something other than a token was piped in, and
    // silently storing the first would be a credential that never works.
    expect(parseToken("pat_abc\npat_def")).toBeUndefined()
  })
})

describe("storeToken", () => {
  it("writes the piped token where the resolver reads it", async () => {
    workspace = makeWorkspace({ agentToken: null })
    rmSync(workspace.agentPat, { force: true })
    const exit = await withStdin("pat_abc123\n", run)
    expect(Exit.isSuccess(exit)).toBe(true)
    expect(readFileSync(workspace.agentPat, "utf8")).toBe("pat_abc123\n")
  })

  it("writes it unreadable by others", async () => {
    workspace = makeWorkspace({ agentToken: null })
    await withStdin("pat_abc123", run)
    expect(statSync(workspace.agentPat).mode & 0o777).toBe(0o600)
  })

  it("replaces an existing token, because rotating one is the reason to re-run", async () => {
    workspace = makeWorkspace({ agentToken: "old-token" })
    await withStdin("pat_new", run)
    expect(readFileSync(workspace.agentPat, "utf8")).toBe("pat_new\n")
  })

  it("creates the configuration directory when it is not there yet", async () => {
    workspace = makeWorkspace({})
    rmSync(workspace.configDir, { recursive: true, force: true })
    await withStdin("pat_abc123", run)
    expect(statSync(workspace.configDir).mode & 0o777).toBe(0o700)
  })

  it("fails when nothing was piped in", async () => {
    workspace = makeWorkspace({ agentToken: null })
    rmSync(workspace.agentPat, { force: true })
    const exit = await withStdin("", run)
    expect(Exit.isFailure(exit)).toBe(true)
  })

  it("treats an unreadable pipe as nothing having been supplied", async () => {
    // There is no useful distinction for the operator: either way no token
    // arrived, and the remedy is the same command.
    workspace = makeWorkspace({ agentToken: null })
    const exit = await withFailingStdin(run)
    expect(Exit.isFailure(exit)).toBe(true)
  })

  it("names the path the token would have gone to", async () => {
    workspace = makeWorkspace({ agentToken: null })
    const exit = await withStdin("", run)
    expect(Exit.isFailure(exit) && JSON.stringify(exit.cause)).toContain("openclaw-agent-pat")
  })
})
