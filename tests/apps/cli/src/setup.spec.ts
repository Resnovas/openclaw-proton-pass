/*
 * Project: openclaw-proton-pass
 * File: setup.spec.ts
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
import { Effect, Layer } from "effect"
import { readFileSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { setup, systemdUnit } from "../../../../apps/cli/src/setup.js"
import { makeWorkspace, type Workspace } from "../../../helpers/workspace.js"

let workspace: Workspace | undefined

afterEach(() => {
  workspace?.dispose()
  workspace = undefined
})

const layer = Layer.provideMerge(Paths.Default, NodeContext.layer)
const run = () => Effect.runPromise(setup.pipe(Effect.provide(layer)))

describe("systemdUnit", () => {
  it("runs the proxy with the given node binary and entry point", () => {
    const unit = systemdUnit("/usr/bin/node", "/opt/app/main.js")
    expect(unit).toContain("ExecStart=/usr/bin/node /opt/app/main.js")
  })

  it("restarts the service on failure", () => {
    expect(systemdUnit("n", "e")).toContain("Restart=always")
  })

  it("installs into the default user target", () => {
    expect(systemdUnit("n", "e")).toContain("WantedBy=default.target")
  })

  it("refuses new privileges", () => {
    expect(systemdUnit("n", "e")).toContain("NoNewPrivileges=true")
  })

  it("documents where the software came from", () => {
    expect(systemdUnit("n", "e")).toContain("github.com/Resnovas/openclaw-proton-pass")
  })
})

describe("setup", () => {
  it("creates the configuration directory private to the user", async () => {
    workspace = makeWorkspace({})
    await run()
    // 0700: the directory holds the agent token.
    expect(statSync(workspace.configDir).mode & 0o777).toBe(0o700)
  })

  it("seeds both configuration files when absent", async () => {
    workspace = makeWorkspace({})
    await run()
    expect(readFileSync(workspace.secretMap, "utf8")).toContain("EXAMPLE_API_KEY")
    expect(readFileSync(workspace.proxyConfig, "utf8")).toContain("127.0.0.1:18890")
  })

  it("writes the seeded files unreadable by others", async () => {
    workspace = makeWorkspace({})
    await run()
    expect(statSync(workspace.secretMap).mode & 0o777).toBe(0o600)
  })

  it("never overwrites an existing secret map", async () => {
    // The map is the one piece of state a re-run must not disturb.
    workspace = makeWorkspace({ secretMap: '{"MINE":"pass://V/i/f"}' })
    await run()
    expect(readFileSync(workspace.secretMap, "utf8")).toContain("MINE")
  })

  it("never overwrites an existing proxy route file", async () => {
    workspace = makeWorkspace({ proxyConfig: '{"routes":{"/mine":{}}}' })
    await run()
    expect(readFileSync(workspace.proxyConfig, "utf8")).toContain("/mine")
  })

  it("is idempotent", async () => {
    workspace = makeWorkspace({})
    await run()
    writeFileSync(workspace.secretMap, '{"EDITED":"pass://V/i/f"}')
    await run()
    expect(readFileSync(workspace.secretMap, "utf8")).toContain("EDITED")
  })

  it("writes a systemd unit next to the configuration", async () => {
    workspace = makeWorkspace({})
    await run()
    const unit = join(workspace.configDir, "..", "systemd", "user", "openclaw-mcp-auth-proxy.service")
    expect(readFileSync(unit, "utf8")).toContain("ExecStart=")
  })

  it("resolves the proxy entry point rather than hardcoding a path", async () => {
    workspace = makeWorkspace({})
    await run()
    const unit = join(workspace.configDir, "..", "systemd", "user", "openclaw-mcp-auth-proxy.service")
    const contents = readFileSync(unit, "utf8")
    expect(contents).toContain("mcp-auth-proxy")
    expect(contents).not.toContain("__ENTRY__")
  })
})
