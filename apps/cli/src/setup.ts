/*
 * Project: openclaw-proton-pass
 * File: setup.ts
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
 * Preparing the configuration directory.
 *
 * Seeds the two configuration files if they are absent and writes the
 * systemd unit. An existing configuration file is never overwritten.
 *
 * @module
 * @since 0.1.0
 */

import { FileSystem, Path } from "@effect/platform"
import { Paths } from "@resnovas/opp-config"
import { Telemetry } from "@resnovas/opp-telemetry"
import { Effect } from "effect"
import { execPath } from "node:process"
import { fileURLToPath } from "node:url"

/**
 * The example secret map written when none exists.
 *
 * The example is Context7 because it is a real, free, open-source MCP server
 * that takes an `Authorization: Bearer` key — so the entry demonstrates the
 * decorated form against something a reader can actually try, rather than a
 * placeholder they have to mentally substitute.
 */
const EXAMPLE_SECRET_MAP = `{
  "CONTEXT7_API_KEY": "pass://OpenClaw/context7.com/API Key",
  "CONTEXT7_MCP_AUTHORIZATION": {
    "ref": "pass://OpenClaw/context7.com/API Key",
    "prefix": "Bearer "
  }
}
`

/** The example proxy route file written when none exists. */
const EXAMPLE_PROXY_CONFIG = `{
  "listen": "127.0.0.1:18890",
  "routes": {
    "/context7": {
      "upstream": "https://mcp.context7.com/mcp",
      "header": "Authorization",
      "secretId": "CONTEXT7_MCP_AUTHORIZATION",
      "timeoutSeconds": 120
    }
  }
}
`

/**
 * Build the systemd user unit for the MCP auth proxy.
 *
 * The unit is generated rather than shipped because only the running installer
 * knows where the proxy actually landed: a checkout can live anywhere, and a
 * hardcoded path is exactly the portability bug this rewrite set out to remove.
 *
 * @remarks
 * Pure and total: string formatting only, with no filesystem access. Both
 * arguments must be absolute paths. The unit is generated per install
 * because only the running installer knows where the proxy landed.
 *
 * @param node - absolute path to the Node binary to run the proxy with
 * @param entry - absolute path to the proxy entry point
 * @returns the unit file contents
 *
 * @example
 * import { systemdUnit } from "@resnovas/opp-cli/setup"
 *
 * const unit = systemdUnit("/usr/bin/node", "/opt/openclaw-proton-pass/proxy.mjs")
 *
 * assert.strictEqual(
 *   unit.includes("ExecStart=/usr/bin/node /opt/openclaw-proton-pass/proxy.mjs"),
 *   true
 * )
 * assert.strictEqual(unit.includes("Restart=always"), true)
 */
export const systemdUnit = (node: string, entry: string): string => `[Unit]
Description=OpenClaw MCP auth proxy (Proton Pass credential injection)
Documentation=https://github.com/Resnovas/openclaw-proton-pass
After=network-online.target
Wants=network-online.target
StartLimitBurst=5
StartLimitIntervalSec=60

[Service]
ExecStart=${node} ${entry}
Restart=always
RestartSec=5
TimeoutStopSec=15
Environment=HOME=%h
NoNewPrivileges=true

[Install]
WantedBy=default.target
`

/**
 * Prepare the configuration directory.
 *
 * An existing file is never overwritten: the secret map is the one piece of
 * state a re-run must not disturb, so seeding only ever fills a gap.
 */
export const setup = Effect.gen(function* () {
  const paths = yield* Paths
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const telemetry = yield* Telemetry

  yield* fs.makeDirectory(paths.configDir, { recursive: true })
  yield* fs.chmod(paths.configDir, 0o700)
  yield* Effect.logInfo(`config directory ready at ${paths.configDir}`)

  const seed = (target: string, contents: string) =>
    Effect.gen(function* () {
      const exists = yield* fs.exists(target).pipe(Effect.orElseSucceed(() => false))
      if (exists) {
        yield* Effect.logInfo(`${path.basename(target)} already exists, left untouched`)
        return
      }
      yield* fs.writeFileString(target, contents)
      yield* fs.chmod(target, 0o600)
      yield* telemetry.diagnostic("cli.config_seeded", "info")
      yield* Effect.logInfo(
        `${path.basename(target)} seeded from the example — edit it before use`
      )
    })

  yield* seed(paths.secretMap, EXAMPLE_SECRET_MAP)
  yield* seed(paths.proxyConfig, EXAMPLE_PROXY_CONFIG)

  // Two layouts have to work: the published package, where every binary is a
  // sibling bundle, and a workspace checkout, where each app has its own dist.
  const here = path.dirname(fileURLToPath(import.meta.url))
  const candidates = [
    path.join(here, "openclaw-mcp-auth-proxy.mjs"),
    path.resolve(here, "..", "..", "mcp-auth-proxy", "dist", "main.js")
  ]
  let proxyEntry = candidates[candidates.length - 1]!
  for (const candidate of candidates) {
    const found = yield* fs.exists(candidate).pipe(Effect.orElseSucceed(() => false))
    if (found) {
      proxyEntry = candidate
      break
    }
  }
  const unitDir = path.join(paths.configDir, "..", "systemd", "user")
  const unitPath = path.join(unitDir, "openclaw-mcp-auth-proxy.service")

  yield* fs.makeDirectory(unitDir, { recursive: true })
  yield* fs.writeFileString(unitPath, systemdUnit(execPath, proxyEntry))
  yield* Effect.logInfo(`systemd unit written to ${unitPath}`)
  yield* Effect.logInfo("  enable with: systemctl --user enable --now openclaw-mcp-auth-proxy")

  yield* Effect.logInfo("")
  yield* Effect.logInfo("Next, create the agent token the Gateway authenticates with:")
  yield* Effect.logInfo(
    "  pass-cli agent create openclaw-gateway --expiration 1y --vault OpenClaw"
  )
  yield* Effect.logInfo(`  install -m 0600 /dev/stdin ${paths.agentPat} <<< '<token>'`)
})
