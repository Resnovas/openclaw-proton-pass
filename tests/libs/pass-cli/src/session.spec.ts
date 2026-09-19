/*
 * Project: openclaw-proton-pass
 * File: session.spec.ts
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
import { PassSession } from "@resnovas/opp-pass-cli"
import { Effect, Exit, Layer } from "effect"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { makeWorkspace, type StubBehaviour, type Workspace } from "../../../helpers/workspace.js"

let workspace: Workspace | undefined

afterEach(() => {
  workspace?.dispose()
  workspace = undefined
})

const layer = Layer.provideMerge(
  PassSession.Default,
  Layer.provideMerge(
    Layer.mergeAll(Paths.Default, Telemetry.Default),
    NodeContext.layer
  )
)

const ensureWith = (stub: StubBehaviour, options: { agentToken?: string | null } = {}) =>
  Effect.gen(function* () {
    const session = yield* PassSession
    return yield* session.ensure
  }).pipe(Effect.provide(layer), Effect.exit)

const start = (stub: StubBehaviour, options: { agentToken?: string | null } = {}) => {
  workspace = makeWorkspace({ stub, ...options })
  return workspace
}

describe("the agent token source", () => {
  const inherited = process.env["OPENCLAW_PROTONPASS_AGENT_TOKEN"]

  afterEach(() => {
    if (inherited === undefined) delete process.env["OPENCLAW_PROTONPASS_AGENT_TOKEN"]
    else process.env["OPENCLAW_PROTONPASS_AGENT_TOKEN"] = inherited
  })

  it.effect("never puts the token on the command line", () =>
    Effect.gen(function* () {
      // A process's arguments are readable by every other process on the
      // host, through /proc/<pid>/cmdline on Linux and ps anywhere. The
      // token travels in the environment, which is readable only by the
      // same user and root.
      start({ infoExit: 1 }, { agentToken: "pat_from_a_file" })
      yield* ensureWith({ infoExit: 1 })
      expect(readFileSync(workspace!.loginArgv, "utf8")).not.toContain("pat_from_a_file")
      expect(readFileSync(workspace!.loginTokenEnv, "utf8")).toBe("pat_from_a_file")
    })
  )

  it.effect("logs in with the token from the environment when one is set", () =>
    Effect.gen(function* () {
      // A container or a managed host already has somewhere to put a secret,
      // so writing one to a file during provisioning buys nothing.
      start({ infoExit: 1 }, { agentToken: null })
      rmSync(workspace!.agentPat, { force: true })
      process.env["OPENCLAW_PROTONPASS_AGENT_TOKEN"] = "pat_from_the_environment"
      const result = yield* ensureWith({ infoExit: 1 })
      expect(Exit.isSuccess(result)).toBe(true)
      expect(readFileSync(workspace!.loginTokenEnv, "utf8")).toBe("pat_from_the_environment")
    })
  )

  it.effect("prefers the environment over a file that also exists", () =>
    Effect.gen(function* () {
      // Exporting the variable states an intent that a leftover file on the
      // same host should not silently override.
      start({ infoExit: 1 }, { agentToken: "pat_from_a_file" })
      process.env["OPENCLAW_PROTONPASS_AGENT_TOKEN"] = "pat_from_the_environment"
      yield* ensureWith({ infoExit: 1 })
      expect(readFileSync(workspace!.loginTokenEnv, "utf8")).toBe("pat_from_the_environment")
    })
  )

  it.effect("falls back to the file when the variable is not set", () =>
    Effect.gen(function* () {
      start({ infoExit: 1 }, { agentToken: "pat_from_a_file" })
      delete process.env["OPENCLAW_PROTONPASS_AGENT_TOKEN"]
      yield* ensureWith({ infoExit: 1 })
      expect(readFileSync(workspace!.loginTokenEnv, "utf8")).toBe("pat_from_a_file")
    })
  )
})

describe("PassSession.ensure", () => {
  it.effect("accepts a session that is already usable", () =>
    Effect.gen(function* () {
      start({ infoExit: 0 })
      const result = yield* ensureWith({ infoExit: 0 })
      expect(Exit.isSuccess(result)).toBe(true)
    })
  )

  it.effect("logs in when the existing session is unusable", () =>
    Effect.gen(function* () {
      start({ infoExit: 1, loginExit: 0 })
      const result = yield* ensureWith({ infoExit: 1, loginExit: 0 })
      expect(Exit.isSuccess(result)).toBe(true)
    })
  )

  it.effect("rebuilds the session directory when the first login fails", () =>
    Effect.gen(function* () {
      // A rotated token leaves an encrypted database that can no longer be
      // decrypted, and logout does not remove it. The only repair is to
      // rebuild the directory, which this asserts actually happens.
      const ws = start({ infoExit: 1, loginExit: 1, loginExitAfterRebuild: 0 })
      mkdirSync(ws.sessionDir, { recursive: true })
      const result = yield* ensureWith({})
      expect(Exit.isSuccess(result)).toBe(true)
      expect(existsSync(ws.sessionDir)).toBe(true)
    })
  )

  it.effect("fails with SessionError when login fails after the rebuild", () =>
    Effect.gen(function* () {
      start({ infoExit: 1, loginExit: 1, loginExitAfterRebuild: 1 })
      const result = yield* ensureWith({})
      expect(Exit.isFailure(result)).toBe(true)
      if (Exit.isFailure(result)) {
        const error = result.cause as unknown as { error?: { _tag?: string } }
        expect(JSON.stringify(result.cause)).toContain("SessionError")
        expect(error).toBeDefined()
      }
    })
  )

  it.effect("fails with MissingAgentTokenError when no token exists", () =>
    Effect.gen(function* () {
      start({ infoExit: 1 }, { agentToken: null })
      const result = yield* ensureWith({})
      expect(Exit.isFailure(result)).toBe(true)
      expect(JSON.stringify(result)).toContain("MissingAgentTokenError")
    })
  )

  it.effect("fails with SessionError when the token cannot be read", () =>
    Effect.gen(function* () {
      const ws = start({ infoExit: 1 }, { agentToken: null })
      // A directory where the token file should be: it exists, so the missing
      // token branch does not fire, but reading it cannot succeed.
      rmSync(ws.agentPat, { force: true })
      mkdirSync(ws.agentPat, { recursive: true })
      const result = yield* ensureWith({})
      expect(Exit.isFailure(result)).toBe(true)
      expect(JSON.stringify(result)).toContain("SessionError")
    })
  )

  it.effect("fails with SessionError when the session directory cannot be rebuilt", () =>
    Effect.gen(function* () {
      const ws = start({ infoExit: 1, loginExit: 1, loginExitAfterRebuild: 0 })
      // A regular file stands where the session directory's parent must be, so
      // the rebuild cannot create it.
      writeFileSync(join(ws.dir, "blocker"), "not a directory")
      process.env["OPENCLAW_PROTONPASS_SESSION_DIR"] = join(ws.dir, "blocker", "session")
      const result = yield* ensureWith({})
      expect(Exit.isFailure(result)).toBe(true)
      expect(JSON.stringify(result)).toContain("SessionError")
    })
  )

  it.effect("exposes the session directory and audit reason to callers", () =>
    Effect.gen(function* () {
      const ws = start({ infoExit: 0 })
      const env = yield* Effect.gen(function* () {
        const session = yield* PassSession
        return session.baseEnv
      }).pipe(Effect.provide(layer))
      expect(env.PROTON_PASS_SESSION_DIR).toBe(ws.sessionDir)
      // Agent tokens refuse audited reads without a reason.
      expect(env.PROTON_PASS_AGENT_REASON).toContain("OpenClaw")
    })
  )
})
