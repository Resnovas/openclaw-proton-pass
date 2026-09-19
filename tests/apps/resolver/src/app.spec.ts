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
import { layer, main } from "../../../../apps/resolver/src/app.js"
import {
  captureStdout,
  withArgv,
  withExitCode,
  withFailingStdin,
  withStdin
} from "../../../helpers/process.js"
import { makeWorkspace, type StubBehaviour, type Workspace } from "../../../helpers/workspace.js"

let workspace: Workspace | undefined

afterEach(() => {
  workspace?.dispose()
  workspace = undefined
})

const runMain = () => Effect.runPromise(main.pipe(Effect.provide(layer)))

const setup = (options: Parameters<typeof makeWorkspace>[0]) => {
  workspace = makeWorkspace(options)
  return workspace
}

describe("resolver app", () => {
  it("writes a protocol response for a resolvable request", async () => {
    setup({ secretMap: '{"A":"pass://V/i/f"}', stub: { values: ["secret"] } })
    const { output } = await captureStdout(() =>
      withArgv([], () => withStdin('{"protocolVersion":1,"ids":["A"]}', runMain))
    )
    expect(JSON.parse(output)).toEqual({ protocolVersion: 1, values: { A: "secret" } })
  })

  it("emits exactly one line of JSON", async () => {
    setup({ secretMap: '{"A":"pass://V/i/f"}', stub: { values: ["secret"] } })
    const { output } = await captureStdout(() =>
      withArgv([], () => withStdin('{"protocolVersion":1,"ids":[]}', runMain))
    )
    expect(output.trimEnd().split("\n")).toHaveLength(1)
  })

  it("reports a malformed request as a protocol error and exits non-zero", async () => {
    setup({ secretMap: "{}" })
    const { result } = await withExitCode(async () =>
      captureStdout(() => withArgv([], () => withStdin("not json", runMain)))
    )
    expect(JSON.parse(result.output).error).toContain("could not parse request")
  })

  it("sets a non-zero exit code when it produced no values", async () => {
    setup({})
    const { exitCode } = await withExitCode(() =>
      captureStdout(() =>
        withArgv([], () => withStdin('{"protocolVersion":1,"ids":["A"]}', runMain))
      )
    )
    expect(exitCode).toBe(1)
  })

  it("leaves the exit code clean on success", async () => {
    setup({ secretMap: '{"A":"pass://V/i/f"}', stub: { values: ["s"] } })
    const { exitCode } = await withExitCode(() =>
      captureStdout(() =>
        withArgv([], () => withStdin('{"protocolVersion":1,"ids":["A"]}', runMain))
      )
    )
    expect(exitCode).toBeUndefined()
  })

  it("reports an unreadable stdin as a protocol error", async () => {
    setup({ secretMap: "{}" })
    const { result } = await withExitCode(async () =>
      captureStdout(() => withArgv([], () => withFailingStdin(runMain)))
    )
    expect(JSON.parse(result.output).error).toContain("could not read stdin")
  })

  it("bootstraps a session when given --ensure-session", async () => {
    setup({ secretMap: "{}", stub: { infoExit: 0 } })
    const { exitCode } = await withExitCode(() =>
      captureStdout(() => withArgv(["--ensure-session"], runMain))
    )
    expect(exitCode).toBeUndefined()
  })

  it("exits non-zero when --ensure-session cannot get a session", async () => {
    // No agent token, and the existing session is unusable.
    setup({ secretMap: "{}", agentToken: null, stub: { infoExit: 1 } })
    const { exitCode } = await withExitCode(() =>
      captureStdout(() => withArgv(["--ensure-session"], runMain))
    )
    expect(exitCode).toBe(1)
  })

  it("writes nothing to stdout in --ensure-session mode", async () => {
    setup({ secretMap: "{}", stub: { infoExit: 0 } })
    const { output } = await captureStdout(() =>
      withArgv(["--ensure-session"], runMain)
    )
    expect(output).toBe("")
  })
})
