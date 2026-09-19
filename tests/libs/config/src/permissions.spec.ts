/*
 * Project: openclaw-proton-pass
 * File: permissions.spec.ts
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
import { icaclsArguments, ownerOnlyMode, restrictToOwner } from "@resnovas/opp-config"
import { Effect, Exit, Logger } from "effect"
import { chmodSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

let dir: string | undefined
const inherited = { PATH: process.env["PATH"], USERNAME: process.env["USERNAME"] }

afterEach(() => {
  if (dir !== undefined) rmSync(dir, { recursive: true, force: true })
  dir = undefined
  for (const [key, value] of Object.entries(inherited)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

/** Collected log messages, so a warning can be asserted rather than assumed. */
const runCollecting = async (effect: Effect.Effect<void, never, never>) => {
  const lines: Array<string> = []
  const capture = Logger.replace(
    Logger.defaultLogger,
    Logger.make(({ message }) => {
      lines.push(String(message))
    })
  )
  await Effect.runPromise(effect.pipe(Effect.provide(capture)))
  return lines
}

const run = (effect: Effect.Effect<void, never, NodeContext.NodeContext>) =>
  runCollecting(effect.pipe(Effect.provide(NodeContext.layer)))

/** A stand-in for `icacls`, so the Windows path is exercised off Windows. */
const stubIcacls = (exitCode: number): void => {
  const bin = join(dir!, "bin")
  mkdirSync(bin, { recursive: true })
  const stub = join(bin, "icacls")
  writeFileSync(stub, `#!/bin/sh\nexit ${exitCode}\n`)
  chmodSync(stub, 0o755)
  process.env["PATH"] = bin
}

describe("ownerOnlyMode", () => {
  it("gives a directory the execute bit a file does not need", () => {
    // Without it the owner cannot traverse into their own configuration.
    expect(ownerOnlyMode("directory")).toBe(0o700)
    expect(ownerOnlyMode("file")).toBe(0o600)
  })
})

describe("icaclsArguments", () => {
  it("drops inherited permissions before granting", () => {
    // Without /inheritance:r the grant is added to what the parent allowed,
    // so the file stays readable by everyone the parent allowed.
    expect(icaclsArguments("C:\\t", "jo")).toEqual([
      "C:\\t",
      "/inheritance:r",
      "/grant:r",
      "jo:F"
    ])
  })
})

describe("restrictToOwner", () => {
  it("applies the POSIX mode off Windows", async () => {
    dir = mkdtempSync(join(tmpdir(), "opp-perm-"))
    const target = join(dir, "token")
    writeFileSync(target, "t")
    chmodSync(target, 0o644)
    await run(restrictToOwner("linux", target, "file"))
    expect(statSync(target).mode & 0o777).toBe(0o600)
  })

  it("warns rather than failing when the mode cannot be set", async () => {
    // A tightened permission is a defence, not a precondition: failing here
    // would leave a half-written configuration directory behind.
    dir = mkdtempSync(join(tmpdir(), "opp-perm-"))
    const lines = await run(restrictToOwner("linux", join(dir, "absent"), "file"))
    expect(lines.some((line) => line.includes("could not set the mode"))).toBe(true)
  })

  it("restricts the access control list on Windows", async () => {
    dir = mkdtempSync(join(tmpdir(), "opp-perm-"))
    stubIcacls(0)
    process.env["USERNAME"] = "jo"
    expect(await run(restrictToOwner("win32", join(dir, "token"), "file"))).toEqual([])
  })

  it("warns when icacls refuses", async () => {
    dir = mkdtempSync(join(tmpdir(), "opp-perm-"))
    stubIcacls(5)
    process.env["USERNAME"] = "jo"
    const lines = await run(restrictToOwner("win32", join(dir, "token"), "file"))
    expect(lines.some((line) => line.includes("icacls exited 5"))).toBe(true)
  })

  it("warns when icacls cannot be run at all", async () => {
    dir = mkdtempSync(join(tmpdir(), "opp-perm-"))
    mkdirSync(join(dir, "empty"), { recursive: true })
    process.env["PATH"] = join(dir, "empty")
    process.env["USERNAME"] = "jo"
    const lines = await run(restrictToOwner("win32", join(dir, "token"), "file"))
    expect(lines.some((line) => line.includes("could not be run"))).toBe(true)
  })

  it("leaves the profile's own permissions alone when no account is named", async () => {
    // Guessing an account and granting it full control is worse than
    // inheriting, which inside a user profile already excludes other users.
    dir = mkdtempSync(join(tmpdir(), "opp-perm-"))
    delete process.env["USERNAME"]
    const lines = await run(restrictToOwner("win32", join(dir, "token"), "file"))
    expect(lines.some((line) => line.includes("USERNAME is unset"))).toBe(true)
  })

  it("never fails, whatever the host", async () => {
    dir = mkdtempSync(join(tmpdir(), "opp-perm-"))
    const exit = await Effect.runPromiseExit(
      restrictToOwner("linux", join(dir, "absent"), "directory").pipe(
        Effect.provide(NodeContext.layer),
        Effect.provide(Logger.remove(Logger.defaultLogger))
      )
    )
    expect(Exit.isSuccess(exit)).toBe(true)
  })
})
