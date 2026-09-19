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
 * Each path has a default and an environment override, so the four binaries
 * cannot disagree about where the secret map lives. Every platform difference
 * is decided in {@link host}, so nothing here branches on the operating
 * system.
 *
 * @module
 * @since 0.1.0
 */

import { FileSystem, Path } from "@effect/platform"
import { Config, Effect } from "effect"
import { homedir, platform as osPlatform } from "node:os"
import {
  configHome as configHomeFor,
  executableNames,
  executableSearchPath,
  homeDirectory,
  hostEnvironment,
  hostPlatform,
  stateHome as stateHomeFor,
  type HostPlatform
} from "./host.js"

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
 * prefix or a relocated home needs no code change. Discovery happens here
 * rather than at each call site so the four binaries cannot disagree about
 * where the secret map lives.
 *
 * The home directory is resolved rather than required. Reading `HOME` and
 * failing without it would take every binary down at startup on Windows,
 * where the variable is normally unset.
 *
 * @category services
 * @since 0.1.0
 */
export class Paths extends Effect.Service<Paths>()("Paths", {
  effect: Effect.gen(function* () {
    const path = yield* Path.Path
    const fs = yield* FileSystem.FileSystem

    const platform: HostPlatform = hostPlatform(osPlatform())
    // Through Config rather than process.env, so a supplied ConfigProvider
    // governs discovery the same way it governs every other setting here.
    const env = yield* hostEnvironment
    const home = homeDirectory(platform, env, homedir())
    const configHome = configHomeFor(platform, env, home)
    const stateHome = stateHomeFor(platform, env, home)

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
     * Every directory on `PATH` is tried before the installer's usual
     * locations, and on Windows every name `PATHEXT` allows is tried in each
     * of them, because `spawn` without a shell resolves neither for us.
     */
    const discoverPassCli = Effect.gen(function* () {
      if (passCliOverride !== undefined) return passCliOverride

      const names = executableNames(platform, env, "pass-cli")
      for (const dir of executableSearchPath(platform, env, home)) {
        for (const name of names) {
          const candidate = path.join(dir, name)
          const usable = yield* fs
            .access(candidate, { ok: true })
            .pipe(Effect.as(true), Effect.orElseSucceed(() => false))
          if (usable) return candidate
        }
      }
      // Nothing was found, so name the binary and let the failure come from
      // the spawn, where the error message says which command was missing.
      return names[0]!
    })

    return {
      platform,
      home,
      configHome,
      stateHome,
      configDir,
      secretMap: secretMapOverride ?? path.join(configDir, "openclaw-secret-map.json"),
      agentPat: agentPatOverride ?? path.join(configDir, "openclaw-agent-pat"),
      sessionDir: sessionOverride ?? path.join(stateHome, "openclaw-protonpass"),
      proxyConfig: proxyOverride ?? path.join(configDir, "openclaw-mcp-proxy.json"),
      passCli: yield* discoverPassCli
    } as const
  })
}) {}
