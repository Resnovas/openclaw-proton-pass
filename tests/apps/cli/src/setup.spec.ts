/*
 * Project: openclaw-proton-pass
 * File: setup.spec.ts
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
import { Telemetry } from "@resnovas/opp-telemetry"
import { Effect, Layer } from "effect"
import { readFileSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import {
  launcherScript,
  launchdPlist,
  scheduledTaskXml,
  serviceArtefact,
  setup,
  systemdIsRunning,
  systemdUnit
} from "../../../../apps/cli/src/setup.js"
import { makeWorkspace, type Workspace } from "../../../helpers/workspace.js"

let workspace: Workspace | undefined

afterEach(() => {
  workspace?.dispose()
  workspace = undefined
})

const layer = Layer.provideMerge(
  Layer.mergeAll(Paths.Default, Telemetry.Default),
  NodeContext.layer
)

/** The suite always names the supervisor, so a host without systemd agrees. */
const run = (service: Parameters<typeof setup>[0] = "systemd") =>
  Effect.runPromise(setup(service).pipe(Effect.provide(layer)))

/** Where each supervisor's artefact lands for the current workspace. */
const artefactPath = {
  systemd: () =>
    join(workspace!.configHome, "systemd", "user", "openclaw-mcp-auth-proxy.service"),
  launchd: () =>
    join(workspace!.home, "Library", "LaunchAgents", "com.resnovas.openclaw-mcp-auth-proxy.plist"),
  schtasks: () => join(workspace!.configDir, "openclaw-mcp-auth-proxy.xml"),
  none: () => join(workspace!.configDir, "openclaw-mcp-auth-proxy.sh")
}

describe("systemdUnit", () => {
  it("runs the proxy with the given node binary and entry point", () => {
    // Both are quoted: systemd splits ExecStart on whitespace, so an install
    // path containing a space would otherwise become two arguments.
    const unit = systemdUnit("/opt/my apps/node", "/opt/my apps/main.js")
    expect(unit).toContain('ExecStart="/opt/my apps/node" "/opt/my apps/main.js"')
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

describe("launchdPlist", () => {
  it("passes the program and its argument separately", () => {
    // An array, not a command line, so a path with a space needs no quoting.
    const plist = launchdPlist("/opt/my apps/node", "/opt/my apps/proxy.mjs", "/Users/jo/Logs")
    expect(plist).toContain("<string>/opt/my apps/node</string>")
    expect(plist).toContain("<string>/opt/my apps/proxy.mjs</string>")
  })

  it("keeps the agent alive and starts it at load", () => {
    const plist = launchdPlist("n", "e", "/l")
    expect(plist).toContain("<key>KeepAlive</key>")
    expect(plist).toContain("<key>RunAtLoad</key>")
  })

  it("captures output, because a launch agent has no journal", () => {
    const plist = launchdPlist("n", "e", "/Users/jo/Logs")
    expect(plist).toContain("<string>/Users/jo/Logs/openclaw-mcp-auth-proxy.log</string>")
    expect(plist).toContain("<key>StandardErrorPath</key>")
  })

  it("escapes characters that cannot appear literally in XML", () => {
    const plist = launchdPlist('/o&p<q>r"s\'t/node', "/e", "/l")
    expect(plist).toContain("/o&amp;p&lt;q&gt;r&quot;s&apos;t/node")
  })
})

describe("scheduledTaskXml", () => {
  it("starts the proxy when the user logs on", () => {
    // At logon, not at boot: the agent token lives in that user's profile.
    const task = scheduledTaskXml("node.exe", "proxy.mjs")
    expect(task).toContain("<LogonTrigger>")
    expect(task).toContain("<LogonType>InteractiveToken</LogonType>")
  })

  it("stays unprivileged", () => {
    expect(scheduledTaskXml("n", "e")).toContain("<RunLevel>LeastPrivilege</RunLevel>")
  })

  it("lifts the execution time limit", () => {
    // The default three-day limit would silently kill a long-lived proxy.
    expect(scheduledTaskXml("n", "e")).toContain("<ExecutionTimeLimit>PT0S</ExecutionTimeLimit>")
  })

  it("hides the console window Node would open", () => {
    expect(scheduledTaskXml("n", "e")).toContain("<Hidden>true</Hidden>")
  })

  it("quotes the entry point so a path with a space survives", () => {
    const task = scheduledTaskXml("C:\\Program Files\\nodejs\\node.exe", "C:\\My Apps\\proxy.mjs")
    expect(task).toContain("<Arguments>\"C:\\My Apps\\proxy.mjs\"</Arguments>")
    expect(task).toContain("<Command>C:\\Program Files\\nodejs\\node.exe</Command>")
  })
})

describe("launcherScript", () => {
  it("replaces the shell so signals reach Node", () => {
    // The supervisor stops the container by signalling this process; a
    // spawned child would not receive it.
    const script = launcherScript("linux", "/usr/bin/node", "/srv/proxy.mjs")
    expect(script).toContain("#!/bin/sh")
    expect(script).toContain('exec "/usr/bin/node" "/srv/proxy.mjs" "$@"')
  })

  it("writes a batch file on Windows", () => {
    const script = launcherScript("win32", "C:\\node.exe", "C:\\proxy.mjs")
    expect(script).toContain("@echo off")
    expect(script).toContain('"C:\\node.exe" "C:\\proxy.mjs" %*')
  })
})

describe("serviceArtefact", () => {
  const context = {
    platform: "linux" as const,
    manager: "systemd" as const,
    home: "/home/jo",
    configHome: "/home/jo/.config",
    configDir: "/home/jo/.config/proton-pass-cli",
    node: "/usr/bin/node",
    entry: "/srv/proxy.mjs"
  }

  it("puts the systemd unit where systemctl reads user units", () => {
    // Under the configuration root, not beside this system's own files:
    // deriving it from the configuration directory would put the unit
    // somewhere systemd never looks as soon as the directory is overridden.
    const artefact = serviceArtefact({ ...context, configDir: "/somewhere/else" })
    expect(artefact.path).toBe(
      "/home/jo/.config/systemd/user/openclaw-mcp-auth-proxy.service"
    )
    expect(artefact.instructions.join("\n")).toContain("systemctl --user enable --now")
  })

  it("mentions lingering, without which a user unit dies at logout", () => {
    expect(serviceArtefact(context).instructions.join("\n")).toContain("enable-linger")
  })

  it("puts the launch agent where launchd reads them", () => {
    const artefact = serviceArtefact({ ...context, platform: "darwin", manager: "launchd" })
    expect(artefact.path).toBe(
      "/home/jo/Library/LaunchAgents/com.resnovas.openclaw-mcp-auth-proxy.plist"
    )
    expect(artefact.instructions.join("\n")).toContain("launchctl bootstrap")
  })

  it("writes the scheduled task beside the configuration it belongs to", () => {
    const artefact = serviceArtefact({
      ...context,
      platform: "win32",
      manager: "schtasks",
      configDir: "C:\\Users\\jo\\AppData\\Roaming\\proton-pass-cli"
    })
    expect(artefact.path).toBe(
      "C:\\Users\\jo\\AppData\\Roaming\\proton-pass-cli\\openclaw-mcp-auth-proxy.xml"
    )
    expect(artefact.instructions.join("\n")).toContain("schtasks /create")
  })

  it("writes an executable launcher when there is no service manager", () => {
    // A container has no init system to register with, so the thing that
    // should restart the proxy is whatever supervises the container.
    const artefact = serviceArtefact({ ...context, manager: "none" })
    expect(artefact.path).toBe("/home/jo/.config/proton-pass-cli/openclaw-mcp-auth-proxy.sh")
    expect(artefact.executable).toBe(true)
    expect(artefact.instructions.join("\n")).toContain("container")
  })

  it("writes a batch launcher when Windows is told to use no service manager", () => {
    const artefact = serviceArtefact({
      ...context,
      platform: "win32",
      manager: "none",
      configDir: "C:\\cfg"
    })
    expect(artefact.path).toBe("C:\\cfg\\openclaw-mcp-auth-proxy.cmd")
  })

  it("leaves every generated unit file non-executable", () => {
    for (const manager of ["systemd", "launchd", "schtasks"] as const) {
      expect(serviceArtefact({ ...context, manager }).executable).toBe(false)
    }
  })
})

describe("systemdIsRunning", () => {
  it("answers without failing, on any host", async () => {
    // It looks for /run/systemd/system, the check systemd's own sd_booted
    // performs, rather than for the systemctl binary: a container built from
    // a systemd distribution has the binary and no systemd to talk to.
    const answer = await Effect.runPromise(
      systemdIsRunning.pipe(Effect.provide(NodeContext.layer))
    )
    expect(typeof answer).toBe("boolean")
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
    expect(readFileSync(workspace.secretMap, "utf8")).toContain("CONTEXT7_API_KEY")
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

  it("writes the systemd unit under the configuration root", async () => {
    workspace = makeWorkspace({})
    await run("systemd")
    expect(readFileSync(artefactPath.systemd(), "utf8")).toContain("ExecStart=")
  })

  it("writes a launch agent when told to target macOS", async () => {
    workspace = makeWorkspace({})
    await run("launchd")
    expect(readFileSync(artefactPath.launchd(), "utf8")).toContain("<key>KeepAlive</key>")
  })

  it("writes a scheduled task when told to target Windows", async () => {
    workspace = makeWorkspace({})
    await run("schtasks")
    expect(readFileSync(artefactPath.schtasks(), "utf8")).toContain("<LogonTrigger>")
  })

  it("writes an executable launcher when there is no service manager", async () => {
    // This is the container case, and the script has to be runnable.
    workspace = makeWorkspace({})
    await run("none")
    expect(readFileSync(artefactPath.none(), "utf8")).toContain("#!/bin/sh")
    expect(statSync(artefactPath.none()).mode & 0o777).toBe(0o700)
  })

  it("detects the supervisor when none is named", async () => {
    workspace = makeWorkspace({})
    await run("auto")
    // Whichever this host has, setup wrote exactly one of the two a Linux
    // host can produce, and never left the operator with nothing.
    const written = [artefactPath.systemd(), artefactPath.none()].filter((path) => {
      try {
        statSync(path)
        return true
      } catch {
        return false
      }
    })
    expect(written).toHaveLength(1)
  })

  it("rewrites the service file on every run", async () => {
    // Unlike the configuration files, its contents are only valid for the
    // install that produced them.
    workspace = makeWorkspace({})
    await run()
    writeFileSync(artefactPath.systemd(), "stale")
    await run()
    expect(readFileSync(artefactPath.systemd(), "utf8")).toContain("ExecStart=")
  })

  it("resolves the proxy entry point rather than hardcoding a path", async () => {
    workspace = makeWorkspace({})
    await run()
    const contents = readFileSync(artefactPath.systemd(), "utf8")
    expect(contents).toContain("mcp-auth-proxy")
    expect(contents).not.toContain("__ENTRY__")
  })
})
