/*
 * Project: openclaw-proton-pass
 * File: device.spec.ts
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
import { deviceContext, installId, installIdFrom } from "@resnovas/opp-telemetry"
import { Effect, Layer } from "effect"
import { createHash } from "node:crypto"
import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { makeWorkspace, type Workspace } from "../../../helpers/workspace.js"

let workspace: Workspace | undefined

afterEach(() => {
  if (workspace !== undefined) {
    // Restore write access so the directory can be removed.
    try {
      chmodSync(workspace.configDir, 0o700)
    } catch {
      // Already writable.
    }
    workspace.dispose()
    workspace = undefined
  }
})

const layer = Layer.provideMerge(Paths.Default, NodeContext.layer)
const resolveId = () => Effect.runPromise(installId.pipe(Effect.provide(layer)))
const resolveDevice = () => Effect.runPromise(deviceContext.pipe(Effect.provide(layer)))

describe("installId", () => {
  const MACHINE_ID = "/etc/machine-id"

  it("derives the same identity for different configuration directories", async () => {
    // The regression this exists for: keying identity to the config directory
    // made one machine report as a new install whenever that directory moved,
    // which is how a single test run produced 26 separate "people".
    workspace = makeWorkspace({})
    const first = await resolveId()
    workspace.dispose()
    workspace = makeWorkspace({})
    const second = await resolveId()
    expect(second).toBe(first)
  })

  it("derives a stable identity across runs", async () => {
    workspace = makeWorkspace({})
    expect(await resolveId()).toBe(await resolveId())
  })

  it("never transmits the raw machine identifier", async () => {
    workspace = makeWorkspace({})
    const raw = readFileSync(MACHINE_ID, "utf8").trim()
    const id = await resolveId()
    expect(id).not.toContain(raw)
    expect(id).toMatch(/^[0-9a-f]{32}$/)
  })

  it("salts the hash, so it cannot be matched against the bare machine id", async () => {
    workspace = makeWorkspace({})
    const raw = readFileSync(MACHINE_ID, "utf8").trim()
    const unsalted = createHash("sha256").update(raw).digest("hex").slice(0, 32)
    expect(await resolveId()).not.toBe(unsalted)
  })

  it("writes nothing into the configuration directory", async () => {
    // Identity no longer lives beside the config, so moving the config keeps it.
    workspace = makeWorkspace({})
    await resolveId()
    expect(existsSync(join(workspace.configDir, "install-id"))).toBe(false)
  })

  it("tries each machine id location in turn", async () => {
    workspace = makeWorkspace({})
    const viaSecond = await Effect.runPromise(
      installIdFrom(["/nonexistent/machine-id", MACHINE_ID]).pipe(Effect.provide(layer))
    )
    expect(viaSecond).toBe(await resolveId())
  })

  it("falls back to a persisted identity when no machine id exists", async () => {
    workspace = makeWorkspace({})
    const stateHome = join(workspace.dir, "state")
    const original = process.env["XDG_STATE_HOME"]
    process.env["XDG_STATE_HOME"] = stateHome
    try {
      const first = await Effect.runPromise(
        installIdFrom(["/nonexistent/machine-id"]).pipe(Effect.provide(layer))
      )
      expect(first).toMatch(/^[0-9a-f-]{36}$/)
      const stored = join(stateHome, "openclaw-proton-pass", "install-id")
      expect(readFileSync(stored, "utf8").trim()).toBe(first)
      expect(statSync(stored).mode & 0o777).toBe(0o600)

      const second = await Effect.runPromise(
        installIdFrom(["/nonexistent/machine-id"]).pipe(Effect.provide(layer))
      )
      expect(second).toBe(first)
    } finally {
      if (original === undefined) delete process.env["XDG_STATE_HOME"]
      else process.env["XDG_STATE_HOME"] = original
    }
  })

  it("falls back to machine attributes when nothing can be persisted", async () => {
    workspace = makeWorkspace({})
    const stateHome = join(workspace.dir, "readonly")
    mkdirSync(stateHome, { recursive: true })
    chmodSync(stateHome, 0o500)
    const original = process.env["XDG_STATE_HOME"]
    process.env["XDG_STATE_HOME"] = stateHome
    try {
      const id = await Effect.runPromise(
        installIdFrom(["/nonexistent/machine-id"]).pipe(Effect.provide(layer))
      )
      expect(id).toMatch(/^derived-[0-9a-f]{32}$/)
    } finally {
      chmodSync(stateHome, 0o700)
      if (original === undefined) delete process.env["XDG_STATE_HOME"]
      else process.env["XDG_STATE_HOME"] = original
    }
  })

  it("uses the home state directory when XDG_STATE_HOME is unset", async () => {
    workspace = makeWorkspace({})
    const original = process.env["XDG_STATE_HOME"]
    const originalHome = process.env["HOME"]
    delete process.env["XDG_STATE_HOME"]
    process.env["HOME"] = workspace.dir
    try {
      const id = await Effect.runPromise(
        installIdFrom(["/nonexistent/machine-id"]).pipe(Effect.provide(layer))
      )
      expect(id).toMatch(/^[0-9a-f-]{36}$/)
    } finally {
      if (original !== undefined) process.env["XDG_STATE_HOME"] = original
      if (originalHome !== undefined) process.env["HOME"] = originalHome
    }
  })

  it("ignores an empty machine id file", async () => {
    workspace = makeWorkspace({})
    const empty = join(workspace.dir, "empty-machine-id")
    writeFileSync(empty, "   \n")
    const stateHome = join(workspace.dir, "state2")
    const original = process.env["XDG_STATE_HOME"]
    process.env["XDG_STATE_HOME"] = stateHome
    try {
      const id = await Effect.runPromise(
        installIdFrom([empty]).pipe(Effect.provide(layer))
      )
      // Falls through to the persisted identity rather than hashing "".
      expect(id).toMatch(/^[0-9a-f-]{36}$/)
    } finally {
      if (original === undefined) delete process.env["XDG_STATE_HOME"]
      else process.env["XDG_STATE_HOME"] = original
    }
  })
})

describe("deviceContext", () => {
  it("describes the machine", async () => {
    workspace = makeWorkspace({})
    const device = await resolveDevice()
    expect(device.os).toBe(process.platform)
    expect(device.arch).toBe(process.arch)
    expect(device.nodeVersion).toBe(process.versions.node)
    expect(device.cpuCount).toBeGreaterThan(0)
    expect(device.memoryGb).toBeGreaterThan(0)
    expect(device.timezone.length).toBeGreaterThan(0)
  }, 30_000)

  it("caches the version lookups", async () => {
    // Spawning npm and pnpm per resolution would be far too expensive for a
    // provider the Gateway invokes per request.
    workspace = makeWorkspace({})
    await resolveDevice()
    const cache = join(workspace.configDir, "device-profile.json")
    expect(existsSync(cache)).toBe(true)
    const parsed = JSON.parse(readFileSync(cache, "utf8")) as { at: number; versions: object }
    expect(parsed.versions).toBeDefined()
    expect(parsed.at).toBeGreaterThan(0)
  }, 30_000)

  it("reads versions from a fresh cache instead of spawning", async () => {
    workspace = makeWorkspace({})
    writeFileSync(
      join(workspace.configDir, "device-profile.json"),
      JSON.stringify({ at: Date.now(), versions: { npm: "9.9.9", pnpm: "8.8.8", passCli: "7.7.7" } })
    )
    const device = await resolveDevice()
    expect(device.npmVersion).toBe("9.9.9")
    expect(device.pnpmVersion).toBe("8.8.8")
    expect(device.passCliVersion).toBe("7.7.7")
  })

  it("refreshes a stale cache", async () => {
    workspace = makeWorkspace({})
    const cache = join(workspace.configDir, "device-profile.json")
    const longAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
    writeFileSync(cache, JSON.stringify({ at: longAgo, versions: { npm: "0.0.1" } }))
    await resolveDevice()
    const parsed = JSON.parse(readFileSync(cache, "utf8")) as { at: number }
    expect(parsed.at).toBeGreaterThan(longAgo)
  }, 30_000)

  it("survives an unparseable cache", async () => {
    workspace = makeWorkspace({})
    writeFileSync(join(workspace.configDir, "device-profile.json"), "{ not json")
    const device = await resolveDevice()
    expect(device.os).toBe(process.platform)
  }, 30_000)

  it("fills in unknown for a tool the cache never recorded", async () => {
    // An older cache, or one written when a tool was absent, must not produce
    // an undefined version field.
    workspace = makeWorkspace({})
    writeFileSync(
      join(workspace.configDir, "device-profile.json"),
      JSON.stringify({ at: Date.now(), versions: {} })
    )
    const device = await resolveDevice()
    expect(device.npmVersion).toBe("unknown")
    expect(device.pnpmVersion).toBe("unknown")
    expect(device.passCliVersion).toBe("unknown")
  })

  it("reports a silent command as unknown rather than empty", async () => {
    // A command that exists but prints nothing should not yield "".
    workspace = makeWorkspace({})
    const silent = join(workspace.dir, "silent")
    writeFileSync(silent, "#!/usr/bin/env bash\nexit 0\n")
    chmodSync(silent, 0o755)
    process.env["PASS_CLI"] = silent
    const device = await resolveDevice()
    expect(device.passCliVersion).toBe("unknown")
  }, 30_000)

  it.each([
    ["true", true],
    ["1", true],
    ["false", false]
  ])("reads CI=%s as %s", async (value, expected) => {
    // Pinned rather than inherited: on a CI runner the ambient value decides
    // which side of the check ever runs, so the other branch would go
    // unexercised exactly where it matters.
    workspace = makeWorkspace({})
    const original = process.env["CI"]
    process.env["CI"] = value
    try {
      expect((await resolveDevice()).isCi).toBe(expected)
    } finally {
      if (original === undefined) delete process.env["CI"]
      else process.env["CI"] = original
    }
  }, 30_000)

  it("reads an absent CI variable as not CI", async () => {
    workspace = makeWorkspace({})
    const original = process.env["CI"]
    delete process.env["CI"]
    try {
      expect((await resolveDevice()).isCi).toBe(false)
    } finally {
      if (original !== undefined) process.env["CI"] = original
    }
  }, 30_000)

  it("reports a missing tool as absent rather than failing", async () => {
    workspace = makeWorkspace({})
    // The stub pass-cli in the workspace does not implement --version.
    const device = await resolveDevice()
    expect(typeof device.passCliVersion).toBe("string")
  }, 30_000)
})
