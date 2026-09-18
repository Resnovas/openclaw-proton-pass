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
import { Effect } from "effect"
import { layer, main } from "../../../../apps/pass-run/src/app.js"
import { withArgv, withExitCode } from "../../../helpers/process.js"
import { makeWorkspace, type Workspace } from "../../../helpers/workspace.js"

let workspace: Workspace | undefined

afterEach(() => {
  workspace?.dispose()
  workspace = undefined
})

const runMain = () => Effect.runPromise(main.pipe(Effect.provide(layer)))

describe("pass-run app", () => {
  it("exits with the usage code when given no command", async () => {
    workspace = makeWorkspace({ secretMap: "{}" })
    const { exitCode } = await withExitCode(() => withArgv([], runMain))
    // 64 is EX_USAGE, so a supervisor can tell misuse from unavailability.
    expect(exitCode).toBe(64)
  })

  it("exits with the usage code for a lone separator", async () => {
    workspace = makeWorkspace({ secretMap: "{}" })
    const { exitCode } = await withExitCode(() => withArgv(["--"], runMain))
    expect(exitCode).toBe(64)
  })

  it("exits EX_UNAVAILABLE when no session can be established", async () => {
    workspace = makeWorkspace({
      secretMap: "{}",
      agentToken: null,
      stub: { infoExit: 1 }
    })
    const { exitCode } = await withExitCode(() => withArgv(["true"], runMain))
    expect(exitCode).toBe(69)
  })

  it("launches the child through pass-cli run", async () => {
    workspace = makeWorkspace({ secretMap: "{}", stub: { infoExit: 0 } })
    const { exitCode } = await withExitCode(() => withArgv(["echo", "hi"], runMain))
    expect(exitCode).toBe(0)
  })

  it("accepts the -- separator before the command", async () => {
    workspace = makeWorkspace({ secretMap: "{}", stub: { infoExit: 0 } })
    const { exitCode } = await withExitCode(() => withArgv(["--", "echo", "hi"], runMain))
    expect(exitCode).toBe(0)
  })

  it("propagates the child's exit code", async () => {
    workspace = makeWorkspace({ secretMap: "{}", stub: { infoExit: 0, runExit: 7 } })
    const { exitCode } = await withExitCode(() => withArgv(["whatever"], runMain))
    expect(exitCode).toBe(7)
  })
})
