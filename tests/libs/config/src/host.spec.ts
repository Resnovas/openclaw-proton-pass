/*
 * Project: openclaw-proton-pass
 * File: host.spec.ts
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

import { describe, expect, it } from "@effect/vitest"
import {
  configHome,
  executableNames,
  executableSearchPath,
  homeDirectory,
  hostPlatform,
  serviceManagerFor,
  stateHome
} from "@resnovas/opp-config"
import { join, win32 } from "node:path"

describe("hostPlatform", () => {
  it("recognises the two platforms that differ", () => {
    expect(hostPlatform("win32")).toBe("win32")
    expect(hostPlatform("darwin")).toBe("darwin")
  })

  it("treats every other POSIX host as Linux", () => {
    // None of the three decisions this type drives differs on a BSD, so
    // widening the type to carry them would add branches with no behaviour.
    expect(hostPlatform("freebsd")).toBe("linux")
    expect(hostPlatform("linux")).toBe("linux")
  })
})

describe("homeDirectory", () => {
  it("prefers HOME on every platform", () => {
    expect(homeDirectory("win32", { HOME: "C:\\home", USERPROFILE: "C:\\other" }, "x")).toBe(
      "C:\\home"
    )
    expect(homeDirectory("linux", { HOME: "/home/jo" }, "/fallback")).toBe("/home/jo")
  })

  it("falls back to USERPROFILE on Windows", () => {
    expect(homeDirectory("win32", { USERPROFILE: "C:\\Users\\jo" }, "x")).toBe("C:\\Users\\jo")
  })

  it("assembles the drive and path pair when USERPROFILE is unset", () => {
    expect(homeDirectory("win32", { HOMEDRIVE: "D:", HOMEPATH: "\\Users\\jo" }, "x")).toBe(
      "D:\\Users\\jo"
    )
  })

  it("ignores half of the drive and path pair", () => {
    // One without the other is not a home directory, so the caller's fallback
    // is better than a path assembled from a single half.
    expect(homeDirectory("win32", { HOMEDRIVE: "D:" }, "fallback")).toBe("fallback")
    expect(homeDirectory("win32", { HOMEPATH: "\\Users\\jo" }, "fallback")).toBe("fallback")
  })

  it("uses the caller's fallback when the environment names no home", () => {
    // Never fails: an unresolvable home would take every binary down at
    // startup, which is the Windows bug this replaced.
    expect(homeDirectory("win32", {}, "C:\\Users\\jo")).toBe("C:\\Users\\jo")
    expect(homeDirectory("linux", {}, "/home/jo")).toBe("/home/jo")
  })

  it("treats a variable exported empty as unset", () => {
    expect(homeDirectory("linux", { HOME: "   " }, "/home/jo")).toBe("/home/jo")
  })
})

describe("configHome", () => {
  it("honours XDG_CONFIG_HOME on every platform", () => {
    expect(configHome("win32", { XDG_CONFIG_HOME: "C:\\cfg" }, "C:\\Users\\jo")).toBe("C:\\cfg")
    expect(configHome("linux", { XDG_CONFIG_HOME: "/cfg" }, "/home/jo")).toBe("/cfg")
  })

  it("uses the roaming profile on Windows", () => {
    // Roaming, not local: configuration should follow a user between machines.
    expect(configHome("win32", { APPDATA: "C:\\Users\\jo\\AppData\\Roaming" }, "C:\\Users\\jo"))
      .toBe("C:\\Users\\jo\\AppData\\Roaming")
  })

  it("derives the roaming profile when APPDATA is unset", () => {
    // Windows path rules, on whatever host this suite runs on: the ambient
    // separator would produce a path Windows cannot use.
    expect(configHome("win32", {}, "C:\\Users\\jo")).toBe("C:\\Users\\jo\\AppData\\Roaming")
  })

  it("puts macOS alongside Linux rather than in the Library", () => {
    expect(configHome("darwin", {}, "/Users/jo")).toBe(join("/Users/jo", ".config"))
    expect(configHome("linux", {}, "/home/jo")).toBe(join("/home/jo", ".config"))
  })
})

describe("stateHome", () => {
  it("honours XDG_STATE_HOME on every platform", () => {
    expect(stateHome("win32", { XDG_STATE_HOME: "C:\\state" }, "C:\\Users\\jo")).toBe("C:\\state")
    expect(stateHome("linux", { XDG_STATE_HOME: "/state" }, "/home/jo")).toBe("/state")
  })

  it("uses the local profile on Windows", () => {
    // Local, not roaming: the session database is machine-specific and
    // roaming it would carry an undecryptable file between machines.
    expect(stateHome("win32", { LOCALAPPDATA: "C:\\Users\\jo\\AppData\\Local" }, "C:\\Users\\jo"))
      .toBe("C:\\Users\\jo\\AppData\\Local")
  })

  it("derives the local profile when LOCALAPPDATA is unset", () => {
    expect(stateHome("win32", {}, "C:\\Users\\jo")).toBe("C:\\Users\\jo\\AppData\\Local")
  })

  it("uses the XDG state directory on every other host", () => {
    expect(stateHome("darwin", {}, "/Users/jo")).toBe(join("/Users/jo", ".local", "state"))
  })
})

describe("executableNames", () => {
  it("uses the bare name off Windows", () => {
    expect(executableNames("linux", { PATHEXT: ".EXE" }, "pass-cli")).toEqual(["pass-cli"])
  })

  it("expands PATHEXT on Windows, lowercased", () => {
    expect(executableNames("win32", { PATHEXT: ".EXE;.CMD" }, "pass-cli")).toEqual([
      "pass-cli.exe",
      "pass-cli.cmd"
    ])
  })

  it("falls back to the usual extensions when PATHEXT is unset", () => {
    expect(executableNames("win32", {}, "pass-cli")).toEqual([
      "pass-cli.com",
      "pass-cli.exe",
      "pass-cli.bat",
      "pass-cli.cmd"
    ])
  })

  it("discards entries that are not extensions", () => {
    expect(executableNames("win32", { PATHEXT: ".EXE;;junk;." }, "pass-cli")).toEqual([
      "pass-cli.exe"
    ])
  })

  it("falls back to the bare name when PATHEXT holds nothing usable", () => {
    // Better to try one name and let the spawn report a missing command than
    // to search nothing at all and report the binary as absent.
    expect(executableNames("win32", { PATHEXT: ";;" }, "pass-cli")).toEqual(["pass-cli"])
  })
})

describe("executableSearchPath", () => {
  it("searches PATH before anything else", () => {
    const dirs = executableSearchPath("linux", { PATH: "/a:/b" }, "/home/jo")
    expect(dirs.slice(0, 2)).toEqual(["/a", "/b"])
  })

  it("discards empty PATH entries", () => {
    // An empty entry means the current directory to some shells, which is the
    // last place a credential tool should look for its binary.
    expect(executableSearchPath("linux", { PATH: "/a::/b" }, "/home/jo").slice(0, 2)).toEqual([
      "/a",
      "/b"
    ])
  })

  it("adds the usual Linux install locations", () => {
    const dirs = executableSearchPath("linux", {}, "/home/jo")
    expect(dirs).toEqual([join("/home/jo", ".local", "bin"), "/usr/local/bin", "/usr/bin"])
  })

  it("adds the Apple Silicon Homebrew prefix on macOS", () => {
    // It is not on a launch agent's PATH, so without it a Homebrew install is
    // invisible to the proxy while being visible in the operator's terminal.
    expect(executableSearchPath("darwin", {}, "/Users/jo")).toContain("/opt/homebrew/bin")
  })

  it("adds the Windows install locations", () => {
    const dirs = executableSearchPath("win32", { LOCALAPPDATA: "C:\\Local" }, "C:\\Users\\jo")
    expect(dirs).toContain(win32.join("C:\\Local", "Programs", "pass-cli"))
    expect(dirs).toContain(win32.join("C:\\Local", "pass-cli"))
  })

  it("derives the Windows install locations when LOCALAPPDATA is unset", () => {
    const dirs = executableSearchPath("win32", {}, "C:\\Users\\jo")
    expect(dirs).toContain("C:\\Users\\jo\\AppData\\Local\\Programs\\pass-cli")
  })

  it("splits a Windows PATH on the semicolon, not the colon", () => {
    // Splitting on the POSIX separator would cut every entry in half at its
    // drive letter, so no directory on PATH would ever be searched.
    const dirs = executableSearchPath("win32", { PATH: "C:\\bin;D:\\tools" }, "C:\\Users\\jo")
    expect(dirs.slice(0, 2)).toEqual(["C:\\bin", "D:\\tools"])
  })
})

describe("serviceManagerFor", () => {
  it("chooses the supervisor each platform actually has", () => {
    expect(serviceManagerFor("darwin", false)).toBe("launchd")
    expect(serviceManagerFor("win32", false)).toBe("schtasks")
    expect(serviceManagerFor("linux", true)).toBe("systemd")
  })

  it("reports no supervisor on a Linux host that is not running systemd", () => {
    // A container is exactly this: a Linux host with no init system, where a
    // unit file could be written but never enabled.
    expect(serviceManagerFor("linux", false)).toBe("none")
  })
})
