/*
 * Project: openclaw-proton-pass
 * File: paths.ts
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

/**
 * Every filesystem location this system reads, discovered once.
 *
 * Each path has a default and an environment override, so the three binaries
 * cannot disagree about where the secret map lives.
 *
 * @module
 * @since 0.1.0
 */

import { FileSystem, Path } from "@effect/platform"
import { Config, Effect } from "effect"
import { delimiter } from "node:path"

/**
 * Read an environment variable, treating unset and empty as the same thing.
 *
 * A variable exported as the empty string is a common accident in service
 * units; taking it literally would point the resolver at the filesystem root.
 */
const optionalEnv = (name: string) =>
  Config.string(name).pipe(
    Config.withDefault(""),
    Config.map((value) => (value.trim() === "" ? undefined : value.trim()))
  )

/**
 * Every filesystem location this system reads, resolved once.
 *
 * Each has a default and an environment override, so a non-default install
 * prefix or an XDG-relocated home needs no code change. Discovery happens here
 * rather than at each call site so the three binaries cannot disagree about
 * where the secret map lives.
 *
 * @category services
 * @since 0.1.0
 */
export class Paths extends Effect.Service<Paths>()("Paths", {
  effect: Effect.gen(function* () {
    const path = yield* Path.Path
    const fs = yield* FileSystem.FileSystem

    const home = yield* Config.string("HOME")
    const xdgConfig = yield* optionalEnv("XDG_CONFIG_HOME")
    const xdgState = yield* optionalEnv("XDG_STATE_HOME")

    const configHome = xdgConfig ?? path.join(home, ".config")
    const stateHome = xdgState ?? path.join(home, ".local", "state")

    const configDirOverride = yield* optionalEnv("OPENCLAW_PROTONPASS_CONFIG_DIR")
    const configDir = configDirOverride ?? path.join(configHome, "proton-pass-cli")

    const secretMapOverride = yield* optionalEnv("OPENCLAW_PROTONPASS_SECRET_MAP")
    const agentPatOverride = yield* optionalEnv("OPENCLAW_PROTONPASS_AGENT_PAT")
    const sessionOverride = yield* optionalEnv("OPENCLAW_PROTONPASS_SESSION_DIR")
    const proxyOverride = yield* optionalEnv("OPENCLAW_MCP_PROXY_CONFIG")
    const passCliOverride = yield* optionalEnv("PASS_CLI")

    /**
     * Locate pass-cli.
     *
     * PATH is searched before the installer's usual locations so an operator
     * can override the binary without editing anything; the explicit fallbacks
     * exist because a systemd unit often runs with a minimal PATH.
     */
    const discoverPassCli = Effect.gen(function* () {
      if (passCliOverride !== undefined) return passCliOverride

      const pathVar = yield* Config.string("PATH").pipe(Config.withDefault(""))
      const candidates = [
        ...pathVar.split(delimiter).filter((entry) => entry !== ""),
        path.join(home, ".local", "bin"),
        "/usr/local/bin",
        "/usr/bin"
      ].map((dir) => path.join(dir, "pass-cli"))

      for (const candidate of candidates) {
        const usable = yield* fs
          .access(candidate, { ok: true })
          .pipe(Effect.as(true), Effect.orElseSucceed(() => false))
        if (usable) return candidate
      }
      return "pass-cli"
    })

    return {
      configDir,
      secretMap: secretMapOverride ?? path.join(configDir, "openclaw-secret-map.json"),
      agentPat: agentPatOverride ?? path.join(configDir, "openclaw-agent-pat"),
      sessionDir: sessionOverride ?? path.join(stateHome, "openclaw-protonpass"),
      proxyConfig: proxyOverride ?? path.join(configDir, "openclaw-mcp-proxy.json"),
      passCli: yield* discoverPassCli
    } as const
  })
}) {}
