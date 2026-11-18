/*
 * Project: openclaw-proton-pass
 * File: workspace.ts
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

import { NodeContext } from "@effect/platform-node"
import { Paths } from "@resnovas/opp-config"
import { Layer } from "effect"
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

/** A disposable configuration directory plus the environment pointing at it. */
export interface Workspace {
  readonly dir: string
  /** Stands in for the user's home directory, so nothing reaches the real one. */
  readonly home: string
  /** Stands in for `$XDG_CONFIG_HOME`, where a systemd user unit belongs. */
  readonly configHome: string
  readonly configDir: string
  readonly secretMap: string
  readonly agentPat: string
  readonly sessionDir: string
  readonly proxyConfig: string
  readonly passCli: string
  /** What the stub pass-cli saw as its `login` arguments, if it ran. */
  readonly loginArgv: string
  /** What the stub pass-cli saw in `PROTON_PASS_PERSONAL_ACCESS_TOKEN`. */
  readonly loginTokenEnv: string
  /** The audit reason the stub pass-cli saw on the read itself. */
  readonly runReason: string
  readonly dispose: () => void
}

/**
 * Behaviour for the stub `pass-cli` a test wants.
 *
 * Driving the real service through a stub binary keeps the Command, session and
 * resolution code paths genuinely executed, rather than mocked away - which is
 * the part most worth testing, since it is where the original shell scripts
 * hid their bugs.
 */
export interface StubBehaviour {
  /** Exit code for `pass-cli info`; non-zero forces the login path. */
  readonly infoExit?: number
  /** Exit code for `pass-cli login`; non-zero forces the rebuild path. */
  readonly loginExit?: number
  /** Exit code for the second login attempt, after the rebuild. */
  readonly loginExitAfterRebuild?: number
  /** Exit code for `pass-cli run`. */
  readonly runExit?: number
  /** NUL-separated values `pass-cli run` should print. */
  readonly values?: ReadonlyArray<string>
  /** Seconds `pass-cli run` should hang, to exercise the timeout path. */
  readonly runDelaySeconds?: number
}

const defaultOpVaultJson = JSON.stringify({
  vaults: [{ name: "Private", vault_id: "vault-1", share_id: "share-1" }]
})

const defaultOpItemsJson = JSON.stringify({
  items: [
    {
      id: "item-1",
      share_id: "share-1",
      vault_id: "vault-1",
      title: "GitHub",
      item_type: "login",
      state: "Active"
    }
  ]
})

const defaultOpItemViewJson = JSON.stringify({
  item: {
    id: "item-1",
    share_id: "share-1",
    vault_id: "vault-1",
    state: "Active",
    content: {
      title: "GitHub",
      note: "",
      content: {
        username: "user",
        password: "secret-value",
        urls: ["https://github.com"]
      }
    }
  }
})

const defaultOpInfoJson = JSON.stringify({
  id: "user-1",
  email: "agent@example.com",
  username: "agent",
  release_track: "stable"
})

const stubScript = (behaviour: StubBehaviour, stateFile: string): string => {
  const values = behaviour.values ?? ["resolved-value"]
  const printf = values.map((value) => `printf '%s\\0' '${value}'`).join("\n    ")
  const vaultJson = defaultOpVaultJson.replaceAll("'", "'\\''")
  const itemsJson = defaultOpItemsJson.replaceAll("'", "'\\''")
  const itemViewJson = defaultOpItemViewJson.replaceAll("'", "'\\''")
  const infoJson = defaultOpInfoJson.replaceAll("'", "'\\''")
  return `#!/usr/bin/env bash
state="${stateFile}"
case "$1" in
  info)
    if [ "$2" = "--output" ]; then
      echo '${infoJson}'
      exit ${behaviour.infoExit ?? 0}
    fi
    exit ${behaviour.infoExit ?? 0}
    ;;
  logout) exit 0 ;;
  login)
    attempts=$(( $(cat "$state" 2>/dev/null || echo 0) + 1 ))
    echo "$attempts" > "$state"
    # Recorded so a test can prove the token travels in the environment and
    # never on the command line, which every other process on the host can
    # read.
    echo "$@" > "$state.argv"
    printf '%s' "\${PROTON_PASS_PERSONAL_ACCESS_TOKEN:-}" > "$state.env"
    if [ "$attempts" = 1 ]; then exit ${behaviour.loginExit ?? 0}; fi
    exit ${behaviour.loginExitAfterRebuild ?? behaviour.loginExit ?? 0}
    ;;
  run)
    printf '%s' "\${PROTON_PASS_AGENT_REASON:-}" > "$state.reason"
    sleep ${behaviour.runDelaySeconds ?? 0}
    if [ "${behaviour.runExit ?? 0}" != "0" ]; then
      echo "stub failure" 1>&2
      exit ${behaviour.runExit ?? 0}
    fi
    ${printf}
    ;;
  vault)
    if [ "$2" = "list" ] && [ "$4" = "json" ]; then
      echo '${vaultJson}'
      exit 0
    fi
    exit 1
    ;;
  item)
    if [ "$2" = "list" ] && [ "$6" = "json" ]; then
      echo '${itemsJson}'
      exit 0
    fi
    if [ "$2" = "view" ] && [ "$8" = "json" ]; then
      echo '${itemViewJson}'
      exit 0
    fi
    if [ "$2" = "view" ] && [ "$3" = "pass://Private/GitHub/password" ]; then
      echo "secret-value"
      exit 0
    fi
    if [ "$2" = "view" ] && [ "$3" = "pass://Private/GitHub/totp?totp=code" ]; then
      echo "123456"
      exit 0
    fi
    exit 1
    ;;
  *) exit 0 ;;
esac
`
}

/**
 * Create a disposable workspace and point the process environment at it.
 *
 * Every path this system reads is overridable, so a test never touches the
 * developer's real configuration - the reason those overrides exist at all.
 */
export const makeWorkspace = (
  options: {
    readonly secretMap?: string
    readonly proxyConfig?: string
    readonly agentToken?: string | null
    readonly stub?: StubBehaviour
  } = {}
): Workspace => {
  const dir = mkdtempSync(join(tmpdir(), "opp-test-"))
  const configDir = join(dir, "config")
  mkdirSync(configDir, { recursive: true })

  // A home of its own, because setup now writes outside its configuration
  // directory: a systemd unit belongs under the configuration root and a
  // launch agent under the home directory. Without these the suite would
  // install service files into the developer's real account.
  const home = join(dir, "home")
  const configHome = join(dir, "config-home")
  const stateHome = join(dir, "state-home")
  mkdirSync(home, { recursive: true })

  const secretMap = join(configDir, "openclaw-secret-map.json")
  const proxyConfig = join(configDir, "openclaw-mcp-proxy.json")
  const agentPat = join(configDir, "openclaw-agent-pat")
  const sessionDir = join(dir, "session")
  const passCli = join(dir, "pass-cli")

  if (options.secretMap !== undefined) writeFileSync(secretMap, options.secretMap)
  if (options.proxyConfig !== undefined) writeFileSync(proxyConfig, options.proxyConfig)
  if (options.agentToken !== null) writeFileSync(agentPat, options.agentToken ?? "stub-token\n")

  writeFileSync(passCli, stubScript(options.stub ?? {}, join(dir, "login-attempts")))
  chmodSync(passCli, 0o755)

  const inherited = {
    HOME: process.env["HOME"],
    XDG_CONFIG_HOME: process.env["XDG_CONFIG_HOME"],
    XDG_STATE_HOME: process.env["XDG_STATE_HOME"]
  }
  process.env["HOME"] = home
  process.env["XDG_CONFIG_HOME"] = configHome
  process.env["XDG_STATE_HOME"] = stateHome
  process.env["OPENCLAW_PROTONPASS_CONFIG_DIR"] = configDir
  process.env["OPENCLAW_PROTONPASS_SECRET_MAP"] = secretMap
  process.env["OPENCLAW_PROTONPASS_AGENT_PAT"] = agentPat
  process.env["OPENCLAW_PROTONPASS_SESSION_DIR"] = sessionDir
  process.env["OPENCLAW_MCP_PROXY_CONFIG"] = proxyConfig
  process.env["PASS_CLI"] = passCli

  return {
    dir,
    home,
    configHome,
    configDir,
    secretMap,
    agentPat,
    sessionDir,
    proxyConfig,
    passCli,
    loginArgv: join(dir, "login-attempts.argv"),
    loginTokenEnv: join(dir, "login-attempts.env"),
    runReason: join(dir, "login-attempts.reason"),
    dispose: () => {
      for (const key of [
        "OPENCLAW_PROTONPASS_CONFIG_DIR",
        "OPENCLAW_PROTONPASS_SECRET_MAP",
        "OPENCLAW_PROTONPASS_AGENT_PAT",
        "OPENCLAW_PROTONPASS_SESSION_DIR",
        "OPENCLAW_MCP_PROXY_CONFIG",
        "PASS_CLI"
      ]) {
        delete process.env[key]
      }
      for (const [key, value] of Object.entries(inherited)) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
      rmSync(dir, { recursive: true, force: true })
    }
  }
}

/** The platform services plus Paths, as the executables provide them. */
export const TestContext = Layer.provideMerge(Paths.Default, NodeContext.layer)
