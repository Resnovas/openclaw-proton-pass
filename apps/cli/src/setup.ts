/*
 * Project: openclaw-proton-pass
 * File: setup.ts
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

/**
 * Preparing the configuration directory.
 *
 * Seeds the two configuration files if they are absent, locks them down, and
 * writes whatever the host uses to keep the proxy running. An existing
 * configuration file is never overwritten.
 *
 * @module
 * @since 0.1.0
 */

import { CommandExecutor, FileSystem, Path } from "@effect/platform"
import { posix, win32 } from "node:path"
import {
  Paths,
  restrictToOwner,
  serviceManagerFor,
  type HostPlatform,
  type ServiceManager
} from "@resnovas/opp-config"
import { Telemetry } from "@resnovas/opp-telemetry"
import { Effect } from "effect"
import { execPath } from "node:process"
import { fileURLToPath } from "node:url"

/** The name every generated service artefact is registered under. */
const LABEL = "openclaw-mcp-auth-proxy"

/** The reverse-DNS label launchd and Task Scheduler identify the job by. */
const QUALIFIED_LABEL = `com.resnovas.${LABEL}`

/**
 * The example secret map written when none exists.
 *
 * The example is Context7 because it is a real, free, open-source MCP server
 * that takes an `Authorization: Bearer` key - so the entry demonstrates the
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

/** Escape the five characters that cannot appear literally in XML text. */
const xml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")

/**
 * What the installer writes so the host can keep the proxy running.
 *
 * @category models
 * @since 0.1.0
 */
export interface ServiceArtefact {
  /** Absolute path the file is written to. */
  readonly path: string
  /** The file's contents. */
  readonly contents: string
  /** Whether the file has to be executable to be useful. */
  readonly executable: boolean
  /** What the operator runs next, one command or note per line. */
  readonly instructions: ReadonlyArray<string>
}

/**
 * Everything the generated service artefact depends on.
 *
 * @category models
 * @since 0.1.0
 */
export interface ServiceContext {
  /** The host family, which decides the file format and its location. */
  readonly platform: HostPlatform
  /** The supervisor to generate for. */
  readonly manager: ServiceManager
  /** The home directory, where launchd expects its agents. */
  readonly home: string
  /** The configuration root, where systemd expects its user units. */
  readonly configHome: string
  /** This system's own configuration directory. */
  readonly configDir: string
  /** Absolute path to the Node binary that should run the proxy. */
  readonly node: string
  /** Absolute path to the proxy entry point. */
  readonly entry: string
}

/**
 * Build the systemd user unit for the MCP auth proxy.
 *
 * @remarks
 * Pure and total: string formatting only, with no filesystem access. Both
 * arguments must be absolute paths, and both are quoted, because systemd
 * splits `ExecStart` on whitespace and an install path containing a space
 * would otherwise be parsed as two arguments. The unit is generated per
 * install because only the running installer knows where the proxy landed.
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
 *   unit.includes('ExecStart="/usr/bin/node" "/opt/openclaw-proton-pass/proxy.mjs"'),
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
ExecStart="${node}" "${entry}"
Restart=always
RestartSec=5
TimeoutStopSec=15
Environment=HOME=%h
NoNewPrivileges=true

[Install]
WantedBy=default.target
`

/**
 * Build the launchd user agent for the MCP auth proxy.
 *
 * @remarks
 * Pure and total: string formatting only, with no filesystem access. The
 * program and its argument are separate array entries rather than one command
 * line, so a path containing a space needs no quoting. `KeepAlive` is the
 * launchd equivalent of `Restart=always`, and both output paths are set
 * because a launch agent has no journal to fall back on: without them the
 * proxy's stderr, which is where it reports a bad route file, goes nowhere.
 *
 * @param node - absolute path to the Node binary to run the proxy with
 * @param entry - absolute path to the proxy entry point
 * @param logDir - directory the agent's stdout and stderr are written to
 * @returns the property list contents
 *
 * @example
 * import { launchdPlist } from "@resnovas/opp-cli/setup"
 *
 * const plist = launchdPlist("/usr/local/bin/node", "/opt/proxy.mjs", "/Users/jo/Library/Logs")
 *
 * assert.strictEqual(plist.includes("<string>/opt/proxy.mjs</string>"), true)
 * assert.strictEqual(plist.includes("<key>KeepAlive</key>"), true)
 */
export const launchdPlist = (node: string, entry: string, logDir: string): string =>
  `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${xml(QUALIFIED_LABEL)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xml(node)}</string>
    <string>${xml(entry)}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ProcessType</key>
  <string>Background</string>
  <key>StandardOutPath</key>
  <string>${xml(`${logDir}/${LABEL}.log`)}</string>
  <key>StandardErrorPath</key>
  <string>${xml(`${logDir}/${LABEL}.log`)}</string>
</dict>
</plist>
`

/**
 * Build the Task Scheduler definition for the MCP auth proxy.
 *
 * @remarks
 * Pure and total: string formatting only, with no filesystem access. The task
 * triggers at logon rather than at boot so that it runs as the user whose
 * profile holds the agent token, and `RunLevel` stays `LeastPrivilege` for the
 * same reason. `Hidden` suppresses the console window Node would otherwise
 * open. `ExecutionTimeLimit` is explicitly unbounded, because the default
 * three-day limit would silently kill a long-lived proxy.
 *
 * @param node - absolute path to the Node binary to run the proxy with
 * @param entry - absolute path to the proxy entry point
 * @returns the task definition as XML
 *
 * @example
 * import { scheduledTaskXml } from "@resnovas/opp-cli/setup"
 *
 * const task = scheduledTaskXml("C:\\Program Files\\nodejs\\node.exe", "C:\\proxy.mjs")
 *
 * assert.strictEqual(task.includes("<LogonTrigger>"), true)
 * assert.strictEqual(task.includes("<ExecutionTimeLimit>PT0S</ExecutionTimeLimit>"), true)
 */
export const scheduledTaskXml = (node: string, entry: string): string =>
  `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>OpenClaw MCP auth proxy (Proton Pass credential injection)</Description>
    <URI>\\${xml(QUALIFIED_LABEL)}</URI>
  </RegistrationInfo>
  <Triggers>
    <LogonTrigger>
      <Enabled>true</Enabled>
    </LogonTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <Hidden>true</Hidden>
    <RestartOnFailure>
      <Interval>PT1M</Interval>
      <Count>3</Count>
    </RestartOnFailure>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Enabled>true</Enabled>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>${xml(node)}</Command>
      <Arguments>"${xml(entry)}"</Arguments>
    </Exec>
  </Actions>
</Task>
`

/**
 * Build a plain launcher script for a host with no service manager.
 *
 * @remarks
 * Pure and total: string formatting only, with no filesystem access. This is
 * what a container gets. There is no init system inside an image to register
 * a unit with, and the thing that should restart the proxy is whatever
 * supervises the container, so the installer emits one command the supervisor
 * can call rather than a unit that could never be enabled. The process is
 * replaced rather than spawned, so signals from the supervisor reach Node
 * directly and the container stops when it is told to.
 *
 * @param platform - the host family, which decides the script dialect
 * @param node - absolute path to the Node binary to run the proxy with
 * @param entry - absolute path to the proxy entry point
 * @returns the script contents
 *
 * @example
 * import { launcherScript } from "@resnovas/opp-cli/setup"
 *
 * assert.strictEqual(launcherScript("linux", "/usr/bin/node", "/srv/proxy.mjs").includes("exec"), true)
 * assert.strictEqual(launcherScript("win32", "node.exe", "proxy.mjs").includes("@echo off"), true)
 */
export const launcherScript = (
  platform: HostPlatform,
  node: string,
  entry: string
): string =>
  platform === "win32"
    ? `@echo off
rem Run the OpenClaw MCP auth proxy in the foreground.
rem Whatever starts this script is responsible for restarting it.
"${node}" "${entry}" %*
`
    : `#!/bin/sh
# Run the OpenClaw MCP auth proxy in the foreground.
# Whatever starts this script is responsible for restarting it: exec replaces
# this shell so signals reach Node directly.
exec "${node}" "${entry}" "$@"
`

/**
 * Decide what to write, where to write it, and what to tell the operator.
 *
 * @remarks
 * Pure and total: it computes paths and contents without touching the
 * filesystem, so every host's output can be checked from any machine. The
 * systemd unit goes under the configuration root rather than beside this
 * system's own files, because `systemctl --user` only reads
 * `$XDG_CONFIG_HOME/systemd/user`; deriving it from the configuration
 * directory instead would put the unit somewhere systemd never looks as soon
 * as `OPENCLAW_PROTONPASS_CONFIG_DIR` is set.
 *
 * @param context - the host, supervisor and resolved paths to generate for
 * @returns the file to write and what to do with it
 *
 * @example
 * import { serviceArtefact } from "@resnovas/opp-cli/setup"
 *
 * const artefact = serviceArtefact({
 *   platform: "linux",
 *   manager: "none",
 *   home: "/root",
 *   configHome: "/root/.config",
 *   configDir: "/root/.config/proton-pass-cli",
 *   node: "/usr/bin/node",
 *   entry: "/srv/proxy.mjs"
 * })
 *
 * assert.strictEqual(artefact.executable, true)
 * assert.strictEqual(artefact.path.endsWith("openclaw-mcp-auth-proxy.sh"), true)
 */
export const serviceArtefact = (context: ServiceContext): ServiceArtefact => {
  const { configDir, configHome, entry, home, manager, node, platform } = context
  // The target host's path rules, which are not necessarily this host's: the
  // same reason libs/config/host.ts reaches for these rather than the Path
  // service, which is bound to the platform it is running on.
  const under = (platform === "win32" ? win32 : posix).join

  if (manager === "systemd") {
    return {
      path: under(configHome, "systemd", "user", `${LABEL}.service`),
      contents: systemdUnit(node, entry),
      executable: false,
      instructions: [
        `systemctl --user daemon-reload`,
        `systemctl --user enable --now ${LABEL}`,
        `loginctl enable-linger "$USER"   # so it survives logout`
      ]
    }
  }

  if (manager === "launchd") {
    return {
      path: under(home, "Library", "LaunchAgents", `${QUALIFIED_LABEL}.plist`),
      contents: launchdPlist(node, entry, under(home, "Library", "Logs")),
      executable: false,
      instructions: [
        `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/${QUALIFIED_LABEL}.plist`,
        `launchctl kickstart -k gui/$(id -u)/${QUALIFIED_LABEL}`,
        `tail -f ~/Library/Logs/${LABEL}.log   # to watch it`
      ]
    }
  }

  if (manager === "schtasks") {
    const taskPath = under(configDir, `${LABEL}.xml`)
    return {
      path: taskPath,
      contents: scheduledTaskXml(node, entry),
      executable: false,
      instructions: [
        `schtasks /create /tn "${QUALIFIED_LABEL}" /xml "${taskPath}" /f`,
        `schtasks /run /tn "${QUALIFIED_LABEL}"`,
        `schtasks /query /tn "${QUALIFIED_LABEL}"   # to check it`
      ]
    }
  }

  const scriptPath = under(configDir, `${LABEL}${platform === "win32" ? ".cmd" : ".sh"}`)
  return {
    path: scriptPath,
    contents: launcherScript(platform, node, entry),
    executable: true,
    instructions: [
      `no service manager was found, so a launcher script was written instead`,
      `run it in the foreground:  ${scriptPath}`,
      `or make it the container's long-running command, so the supervisor restarts it`
    ]
  }
}

/**
 * Whether this host is running systemd.
 *
 * @remarks
 * Never fails. `/run/systemd/system` is present exactly when systemd is the
 * init system, which is the check systemd's own `sd_booted` performs. A
 * container image built from a systemd distribution still has `systemctl` on
 * its `PATH` while having no systemd to talk to, so looking for the binary
 * would report every container as supervised and produce a unit file nothing
 * can enable.
 *
 * @category utils
 * @since 0.1.0
 */
export const systemdIsRunning: Effect.Effect<boolean, never, FileSystem.FileSystem> =
  Effect.flatMap(FileSystem.FileSystem, (fs) =>
    fs.exists("/run/systemd/system").pipe(Effect.orElseSucceed(() => false))
  )

/**
 * Locate the proxy entry point for this install.
 *
 * Two layouts have to work: the published package, where every binary is a
 * sibling bundle, and a workspace checkout, where each app has its own dist.
 */
const findProxyEntry = Effect.gen(function* () {
  const path = yield* Path.Path
  const fs = yield* FileSystem.FileSystem
  const here = path.dirname(fileURLToPath(import.meta.url))
  const candidates = [
    path.join(here, `${LABEL}.mjs`),
    path.resolve(here, "..", "..", "mcp-auth-proxy", "dist", "main.js")
  ]
  // The workspace layout is the fallback, so a checkout that has not been
  // built yet still produces a service file naming where the proxy will be.
  let entry = candidates[candidates.length - 1]!
  for (const candidate of candidates) {
    const found = yield* fs.exists(candidate).pipe(Effect.orElseSucceed(() => false))
    if (found) {
      entry = candidate
      break
    }
  }
  return entry
})

/**
 * Prepare the configuration directory.
 *
 * @remarks
 * An existing file is never overwritten: the secret map is the one piece of
 * state a re-run must not disturb, so seeding only ever fills a gap. The
 * service artefact is the exception and is rewritten every time, because the
 * paths inside it are only valid for the install that produced them.
 *
 * @param requested - the supervisor to generate for, or `auto` to detect one
 * @returns an Effect that completes once the directory is prepared
 *
 * @example
 * import { setup } from "@resnovas/opp-cli/setup"
 * import { Effect } from "effect"
 *
 * // Nothing has been written yet: `setup` yields an Effect, so the install
 * // happens only when it is run against the app's layer.
 * assert.strictEqual(Effect.isEffect(setup("auto")), true)
 */
export const setup = (
  requested: ServiceManager | "auto"
): Effect.Effect<
  void,
  never,
  Paths | Telemetry | FileSystem.FileSystem | Path.Path | CommandExecutor.CommandExecutor
> =>
  Effect.gen(function* () {
    const paths = yield* Paths
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const telemetry = yield* Telemetry

    yield* fs.makeDirectory(paths.configDir, { recursive: true }).pipe(Effect.orDie)
    yield* restrictToOwner(paths.platform, paths.configDir, "directory")
    yield* Effect.logInfo(`config directory ready at ${paths.configDir}`)

    const seed = (target: string, contents: string) =>
      Effect.gen(function* () {
        const exists = yield* fs.exists(target).pipe(Effect.orElseSucceed(() => false))
        if (exists) {
          yield* Effect.logInfo(`${path.basename(target)} already exists, left untouched`)
          return
        }
        yield* fs.writeFileString(target, contents).pipe(Effect.orDie)
        yield* restrictToOwner(paths.platform, target, "file")
        yield* telemetry.diagnostic("cli.config_seeded", "info")
        yield* Effect.logInfo(
          `${path.basename(target)} seeded from the example - edit it before use`
        )
      })

    yield* seed(paths.secretMap, EXAMPLE_SECRET_MAP)
    yield* seed(paths.proxyConfig, EXAMPLE_PROXY_CONFIG)

    const manager =
      requested === "auto"
        ? serviceManagerFor(paths.platform, yield* systemdIsRunning)
        : requested

    const artefact = serviceArtefact({
      platform: paths.platform,
      manager,
      home: paths.home,
      configHome: paths.configHome,
      configDir: paths.configDir,
      node: execPath,
      entry: yield* findProxyEntry
    })

    yield* fs
      .makeDirectory(path.dirname(artefact.path), { recursive: true })
      .pipe(Effect.orDie)
    yield* fs.writeFileString(artefact.path, artefact.contents).pipe(Effect.orDie)
    if (artefact.executable && paths.platform !== "win32") {
      yield* fs.chmod(artefact.path, 0o700).pipe(Effect.ignore)
    }

    yield* Effect.logInfo(`${manager} configuration written to ${artefact.path}`)
    for (const line of artefact.instructions) {
      yield* Effect.logInfo(`  ${line}`)
    }

    yield* Effect.logInfo("")
    yield* Effect.logInfo("Next, create the agent token the Gateway authenticates with:")
    yield* Effect.logInfo(
      "  pass-cli agent create openclaw-gateway --expiration 1y --vault OpenClaw"
    )
    yield* Effect.logInfo("then store it, reading the token from standard input:")
    yield* Effect.logInfo("  openclaw-proton-pass token")
  })
