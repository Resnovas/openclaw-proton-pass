/*
 * Project: openclaw-proton-pass
 * File: paths.spec.ts
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
import { join } from "node:path"
import { makeWorkspace, type Workspace } from "../../../helpers/workspace.js"

let workspace: Workspace | undefined

afterEach(() => {
  workspace?.dispose()
  workspace = undefined
})

const resolvePaths = Effect.gen(function* () {
  return yield* Paths
}).pipe(Effect.provide(Layer.provideMerge(Paths.Default, NodeContext.layer)))

describe("Paths", () => {
  it.effect("honours every environment override", () =>
    Effect.gen(function* () {
      workspace = makeWorkspace({ secretMap: "{}" })
      const paths = yield* resolvePaths
      expect(paths.configDir).toBe(workspace.configDir)
      expect(paths.secretMap).toBe(workspace.secretMap)
      expect(paths.agentPat).toBe(workspace.agentPat)
      expect(paths.sessionDir).toBe(workspace.sessionDir)
      expect(paths.proxyConfig).toBe(workspace.proxyConfig)
      expect(paths.passCli).toBe(workspace.passCli)
    })
  )

  it.effect("derives defaults from XDG when nothing is overridden", () =>
    Effect.gen(function* () {
      workspace = makeWorkspace({})
      const configHome = join(workspace.dir, "xdg-config")
      const stateHome = join(workspace.dir, "xdg-state")
      for (const key of [
        "OPENCLAW_PROTONPASS_CONFIG_DIR",
        "OPENCLAW_PROTONPASS_SECRET_MAP",
        "OPENCLAW_PROTONPASS_AGENT_PAT",
        "OPENCLAW_PROTONPASS_SESSION_DIR",
        "OPENCLAW_MCP_PROXY_CONFIG"
      ]) {
        delete process.env[key]
      }
      process.env["XDG_CONFIG_HOME"] = configHome
      process.env["XDG_STATE_HOME"] = stateHome

      const paths = yield* resolvePaths
      expect(paths.configDir).toBe(join(configHome, "proton-pass-cli"))
      expect(paths.secretMap).toBe(join(configHome, "proton-pass-cli", "openclaw-secret-map.json"))
      expect(paths.agentPat).toBe(join(configHome, "proton-pass-cli", "openclaw-agent-pat"))
      expect(paths.proxyConfig).toBe(join(configHome, "proton-pass-cli", "openclaw-mcp-proxy.json"))
      expect(paths.sessionDir).toBe(join(stateHome, "openclaw-protonpass"))
      delete process.env["XDG_CONFIG_HOME"]
      delete process.env["XDG_STATE_HOME"]
    })
  )

  it.effect("falls back to ~/.config and ~/.local/state when XDG is unset", () =>
    Effect.gen(function* () {
      workspace = makeWorkspace({})
      for (const key of [
        "OPENCLAW_PROTONPASS_CONFIG_DIR",
        "OPENCLAW_PROTONPASS_SECRET_MAP",
        "OPENCLAW_PROTONPASS_AGENT_PAT",
        "OPENCLAW_PROTONPASS_SESSION_DIR",
        "OPENCLAW_MCP_PROXY_CONFIG",
        "XDG_CONFIG_HOME",
        "XDG_STATE_HOME"
      ]) {
        delete process.env[key]
      }
      const home = process.env["HOME"]
      const paths = yield* resolvePaths
      expect(paths.configDir).toBe(join(home!, ".config", "proton-pass-cli"))
      expect(paths.sessionDir).toBe(join(home!, ".local", "state", "openclaw-protonpass"))
    })
  )

  it.effect("treats an empty override as unset", () =>
    Effect.gen(function* () {
      workspace = makeWorkspace({})
      // A variable exported as the empty string is a common service-unit
      // accident; taking it literally would point the resolver at the root.
      process.env["OPENCLAW_PROTONPASS_CONFIG_DIR"] = "   "
      delete process.env["OPENCLAW_PROTONPASS_SECRET_MAP"]
      process.env["XDG_CONFIG_HOME"] = join(workspace.dir, "xdg")

      const paths = yield* resolvePaths
      expect(paths.configDir).toBe(join(workspace.dir, "xdg", "proton-pass-cli"))
      delete process.env["XDG_CONFIG_HOME"]
    })
  )

  it.effect("discovers pass-cli on PATH when PASS_CLI is unset", () =>
    Effect.gen(function* () {
      workspace = makeWorkspace({})
      delete process.env["PASS_CLI"]
      // The stub is named pass-cli inside the workspace, so putting that
      // directory first on PATH is exactly the discovery case.
      const original = process.env["PATH"]
      process.env["PATH"] = `${workspace.dir}:${original ?? ""}`
      const paths = yield* resolvePaths
      expect(paths.passCli).toBe(workspace.passCli)
      process.env["PATH"] = original ?? ""
    })
  )

  it.effect("falls back to the bare name when pass-cli is nowhere", () =>
    Effect.gen(function* () {
      workspace = makeWorkspace({})
      delete process.env["PASS_CLI"]
      const original = process.env["PATH"]
      const home = process.env["HOME"]
      process.env["PATH"] = join(workspace.dir, "empty")
      process.env["HOME"] = join(workspace.dir, "no-home")
      const paths = yield* resolvePaths
      expect(paths.passCli).toBe("pass-cli")
      process.env["PATH"] = original ?? ""
      process.env["HOME"] = home ?? ""
    })
  )
})
