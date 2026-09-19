/*
 * Project: openclaw-proton-pass
 * File: app.spec.ts
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
import { Effect, Exit } from "effect"
import { existsSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { layer, run } from "../../../../apps/cli/src/app.js"
import { withStdin } from "../../../helpers/process.js"
import { makeWorkspace, type Workspace } from "../../../helpers/workspace.js"

let workspace: Workspace | undefined

afterEach(() => {
  workspace?.dispose()
  workspace = undefined
})

const invoke = (args: ReadonlyArray<string>) =>
  Effect.runPromise(
    run(["node", "openclaw-proton-pass", ...args]).pipe(Effect.provide(layer), Effect.exit)
  )

describe("cli", () => {
  it("runs doctor without changing anything", async () => {
    workspace = makeWorkspace({ secretMap: "{}" })
    const result = await invoke(["doctor"])
    expect(Exit.isSuccess(result)).toBe(true)
    // doctor is read-only: it must not have created the file it reported missing.
    expect(existsSync(workspace.proxyConfig)).toBe(false)
  })

  it("runs setup and creates the configuration", async () => {
    workspace = makeWorkspace({})
    const result = await invoke(["setup"])
    expect(Exit.isSuccess(result)).toBe(true)
    expect(existsSync(workspace.secretMap)).toBe(true)
    expect(statSync(workspace.configDir).mode & 0o777).toBe(0o700)
  })

  it("writes the systemd unit during setup", async () => {
    workspace = makeWorkspace({})
    await invoke(["setup", "--service", "systemd"])
    const unit = join(
      workspace.configHome,
      "systemd",
      "user",
      "openclaw-mcp-auth-proxy.service"
    )
    expect(existsSync(unit)).toBe(true)
  })

  it("targets another host's supervisor when told to", async () => {
    // The option exists for what detection cannot see: preparing an install
    // for a target that is not the machine running setup.
    workspace = makeWorkspace({})
    await invoke(["setup", "--service", "schtasks"])
    expect(existsSync(join(workspace.configDir, "openclaw-mcp-auth-proxy.xml"))).toBe(true)
  })

  it("stores a piped agent token", async () => {
    workspace = makeWorkspace({ agentToken: null })
    const result = await withStdin("pat_abc123\n", () => invoke(["token"]))
    expect(Exit.isSuccess(result)).toBe(true)
    expect(existsSync(workspace.agentPat)).toBe(true)
  })

  it("fails the token command when nothing was piped in", async () => {
    workspace = makeWorkspace({ agentToken: null })
    const result = await withStdin("", () => invoke(["token"]))
    expect(Exit.isFailure(result)).toBe(true)
  })

  it("points the bare invocation at --help", async () => {
    workspace = makeWorkspace({ secretMap: "{}" })
    const result = await invoke([])
    expect(Exit.isSuccess(result)).toBe(true)
  })

  it("records a failed command rather than swallowing the failure", async () => {
    // setup cannot create its directory under a regular file, so the command
    // fails and the failure outcome is what gets reported.
    workspace = makeWorkspace({})
    writeFileSync(join(workspace.dir, "blocker"), "not a directory")
    process.env["OPENCLAW_PROTONPASS_CONFIG_DIR"] = join(workspace.dir, "blocker", "config")
    const result = await invoke(["setup", "--service", "none"])
    expect(Exit.isFailure(result)).toBe(true)
  })

  it("setup then doctor reports a healthy workspace", async () => {
    workspace = makeWorkspace({})
    await invoke(["setup"])
    const result = await invoke(["doctor"])
    expect(Exit.isSuccess(result)).toBe(true)
  })
})
