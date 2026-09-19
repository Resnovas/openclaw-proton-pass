/*
 * Project: openclaw-proton-pass
 * File: host.ts
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
 * Everything that differs between the hosts this system runs on.
 *
 * Each difference is decided by a pure function of the platform name and the
 * environment, so no other module branches on `process.platform` and every
 * branch can be tested from any machine.
 *
 * @module
 * @since 0.1.0
 */

import { Config, Effect, Option } from "effect"
import { posix, win32 } from "node:path"

/**
 * The host families this system distinguishes between.
 *
 * Only three, because only three decisions ever differ: where per-user files
 * belong, what an executable is called, and what supervises a long-running
 * process. Every other Unix is treated as Linux, which is correct for all
 * three of those decisions.
 *
 * @category models
 * @since 0.1.0
 */
export type HostPlatform = "linux" | "darwin" | "win32"

/**
 * A read-only view of the process environment.
 *
 * Taken as an argument rather than read from `process.env` so that the
 * functions here stay pure and a test can describe a host it is not running
 * on.
 *
 * @category models
 * @since 0.1.0
 */
export type Environment = Readonly<Record<string, string | undefined>>

/**
 * How a long-running process is kept alive on this host.
 *
 * `none` is not a failure. A container has no init system to register with,
 * and the supervisor outside it is the right place for the process to be
 * declared, so the installer emits a launcher script instead of a unit.
 *
 * @category models
 * @since 0.1.0
 */
export type ServiceManager = "systemd" | "launchd" | "schtasks" | "none"

/**
 * Every variable host discovery reads.
 *
 * Named exhaustively because `Config` reads one key at a time, which is the
 * point: the set of variables this system depends on is visible in one place
 * rather than implied by scattered lookups, and a plugin host that filters
 * the environment can be told exactly what to pass through.
 *
 * @category constants
 * @since 0.1.0
 *
 * @example
 * import { HOST_VARIABLES } from "@resnovas/opp-config"
 *
 * assert.strictEqual(HOST_VARIABLES.includes("XDG_CONFIG_HOME"), true)
 * assert.strictEqual(HOST_VARIABLES.includes("LOCALAPPDATA"), true)
 */
export const HOST_VARIABLES = [
  "HOME",
  "USERPROFILE",
  "HOMEDRIVE",
  "HOMEPATH",
  "XDG_CONFIG_HOME",
  "XDG_STATE_HOME",
  "APPDATA",
  "LOCALAPPDATA",
  "PATH",
  "PATHEXT"
] as const

/**
 * Read the variables host discovery depends on, through Effect's config layer.
 *
 * @remarks
 * Never fails: a variable that is absent is absent, which every function
 * here already handles. Going through `Config` rather than `process.env`
 * means a test or an embedding application can supply a `ConfigProvider` and
 * have discovery honour it, which reading the global object directly would
 * quietly bypass.
 *
 * @returns an Effect yielding the environment host discovery should use
 *
 * @example
 * import { hostEnvironment } from "@resnovas/opp-config"
 * import { ConfigProvider, Effect } from "effect"
 *
 * const env = Effect.runSync(
 *   hostEnvironment.pipe(
 *     Effect.withConfigProvider(ConfigProvider.fromMap(new Map([["HOME", "/home/jo"]])))
 *   )
 * )
 *
 * assert.strictEqual(env["HOME"], "/home/jo")
 * assert.strictEqual(env["APPDATA"], undefined)
 */
export const hostEnvironment: Effect.Effect<Environment> = Effect.forEach(
  HOST_VARIABLES,
  (name) =>
    Config.string(name).pipe(
      Config.option,
      Effect.orElseSucceed(() => Option.none<string>()),
      Effect.map((value) => [name, Option.getOrUndefined(value)] as const)
    )
).pipe(Effect.map((entries) => Object.fromEntries(entries)))

/**
 * The path rules of the named host, rather than of the host we are running on.
 *
 * Effect's `Path` service is deliberately not used here. It is bound to the
 * running platform, so on Linux it would join a Windows path with forward
 * slashes, and these functions exist precisely to describe a host that is not
 * this one. `NodePath.layerWin32` wraps this same module, so nothing is
 * bypassed by reaching for it directly; what is avoided is threading a second
 * `Path` layer through functions that are otherwise pure and synchronous.
 * Everything that resolves a path for the host it is actually running on goes
 * through the `Path` service, in `Paths`.
 */
const rules = (platform: HostPlatform) => (platform === "win32" ? win32 : posix)

/**
 * Read one variable, treating unset, empty and whitespace as the same thing.
 *
 * A variable exported as the empty string is a common accident in service
 * units and container images; taking it literally would point the resolver at
 * the filesystem root.
 */
const set = (env: Environment, name: string): string | undefined => {
  const value = env[name]
  if (value === undefined) return undefined
  const trimmed = value.trim()
  return trimmed === "" ? undefined : trimmed
}

/**
 * Classify a `process.platform` value into a host family.
 *
 * @remarks
 * Pure and total. Any value other than `darwin` or `win32` is reported as
 * `linux`, because the remaining platforms Node runs on are POSIX systems
 * that follow the same conventions for all three decisions this type drives.
 *
 * @param value - the value of `process.platform`
 * @returns the host family that value belongs to
 *
 * @example
 * import { hostPlatform } from "@resnovas/opp-config"
 *
 * assert.strictEqual(hostPlatform("win32"), "win32")
 * assert.strictEqual(hostPlatform("darwin"), "darwin")
 * assert.strictEqual(hostPlatform("freebsd"), "linux")
 */
export const hostPlatform = (value: string): HostPlatform =>
  value === "win32" || value === "darwin" ? value : "linux"

/**
 * Locate the user's home directory.
 *
 * @remarks
 * Pure and total. `HOME` is checked first on every platform, because a
 * Windows shell that sets it means it, and a container may set it while
 * having no passwd entry for the user. Windows otherwise uses `USERPROFILE`,
 * then the `HOMEDRIVE` and `HOMEPATH` pair, and any host falls back to the
 * value supplied by the caller. Never fails: an unresolvable home would take
 * every binary down at startup, and `os.homedir()` always yields something.
 *
 * @param platform - the host family
 * @param env - the process environment
 * @param fallback - the value to use when the environment names no home, normally `os.homedir()`
 * @returns an absolute path to the home directory
 *
 * @example
 * import { homeDirectory } from "@resnovas/opp-config"
 *
 * assert.strictEqual(
 *   homeDirectory("win32", { USERPROFILE: "C:\\Users\\jo" }, "ignored"),
 *   "C:\\Users\\jo"
 * )
 * assert.strictEqual(homeDirectory("linux", {}, "/home/jo"), "/home/jo")
 */
export const homeDirectory = (
  platform: HostPlatform,
  env: Environment,
  fallback: string
): string => {
  const home = set(env, "HOME")
  if (home !== undefined) return home
  if (platform === "win32") {
    const profile = set(env, "USERPROFILE")
    if (profile !== undefined) return profile
    const drive = set(env, "HOMEDRIVE")
    const relative = set(env, "HOMEPATH")
    if (drive !== undefined && relative !== undefined) return `${drive}${relative}`
  }
  return fallback
}

/**
 * Locate the directory per-user configuration belongs in.
 *
 * @remarks
 * Pure and total. `XDG_CONFIG_HOME` wins everywhere, including on Windows,
 * because setting it is an explicit instruction rather than a convention.
 * Windows otherwise uses `APPDATA`, which is the roaming profile and so
 * follows a user between machines, as configuration should. macOS uses
 * `~/.config` alongside Linux rather than `~/Library/Application Support`,
 * which matches every other command-line tool a reader will already have
 * configured and keeps one documented layout for both.
 *
 * @param platform - the host family
 * @param env - the process environment
 * @param home - the home directory, from `homeDirectory`
 * @returns an absolute path to the configuration root
 *
 * @example
 * import { configHome } from "@resnovas/opp-config"
 *
 * assert.strictEqual(configHome("linux", {}, "/home/jo"), "/home/jo/.config")
 * assert.strictEqual(configHome("darwin", {}, "/Users/jo"), "/Users/jo/.config")
 *
 * // Built with Windows path rules, whatever host this runs on.
 * assert.strictEqual(configHome("win32", {}, "C:\\Users\\jo"), "C:\\Users\\jo\\AppData\\Roaming")
 */
export const configHome = (
  platform: HostPlatform,
  env: Environment,
  home: string
): string => {
  const xdg = set(env, "XDG_CONFIG_HOME")
  if (xdg !== undefined) return xdg
  if (platform === "win32") {
    return set(env, "APPDATA") ?? rules(platform).join(home, "AppData", "Roaming")
  }
  return rules(platform).join(home, ".config")
}

/**
 * Locate the directory per-user state belongs in.
 *
 * @remarks
 * Pure and total. State is the session database, which is machine-specific
 * and must not roam, so Windows uses `LOCALAPPDATA` rather than the roaming
 * `APPDATA` that configuration uses. `XDG_STATE_HOME` wins everywhere.
 *
 * @param platform - the host family
 * @param env - the process environment
 * @param home - the home directory, from `homeDirectory`
 * @returns an absolute path to the state root
 *
 * @example
 * import { stateHome } from "@resnovas/opp-config"
 *
 * assert.strictEqual(stateHome("linux", {}, "/home/jo"), "/home/jo/.local/state")
 *
 * // Local rather than roaming: a session database cannot follow a user to
 * // another machine, because only the machine that wrote it can decrypt it.
 * assert.strictEqual(stateHome("win32", {}, "C:\\Users\\jo"), "C:\\Users\\jo\\AppData\\Local")
 */
export const stateHome = (
  platform: HostPlatform,
  env: Environment,
  home: string
): string => {
  const xdg = set(env, "XDG_STATE_HOME")
  if (xdg !== undefined) return xdg
  if (platform === "win32") {
    return set(env, "LOCALAPPDATA") ?? rules(platform).join(home, "AppData", "Local")
  }
  return rules(platform).join(home, ".local", "state")
}

/**
 * Every filename a given executable might have on this host.
 *
 * @remarks
 * Pure and total. On Windows an executable is identified by its extension,
 * and `spawn` without a shell performs no `PATHEXT` resolution of its own, so
 * the caller has to try each candidate itself. `PATHEXT` is honoured because
 * a locked-down host may shorten it. Extensions are lowercased, since
 * `PATHEXT` conventionally holds them in upper case while the file on disk is
 * lower case, and a case-sensitive filesystem mounted on Windows would then
 * miss.
 *
 * @param platform - the host family
 * @param env - the process environment
 * @param base - the executable's name without an extension
 * @returns the filenames to try, in order
 *
 * @example
 * import { executableNames } from "@resnovas/opp-config"
 *
 * assert.deepStrictEqual(executableNames("linux", {}, "pass-cli"), ["pass-cli"])
 * assert.deepStrictEqual(
 *   executableNames("win32", { PATHEXT: ".EXE;.CMD" }, "pass-cli"),
 *   ["pass-cli.exe", "pass-cli.cmd"]
 * )
 */
export const executableNames = (
  platform: HostPlatform,
  env: Environment,
  base: string
): ReadonlyArray<string> => {
  if (platform !== "win32") return [base]
  const pathext = set(env, "PATHEXT") ?? ".COM;.EXE;.BAT;.CMD"
  const extensions = pathext
    .split(";")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.startsWith(".") && entry.length > 1)
  return extensions.length === 0 ? [base] : extensions.map((entry) => `${base}${entry}`)
}

/**
 * Every directory an executable might be installed in on this host.
 *
 * @remarks
 * Pure and total. `PATH` comes first so an operator can override the binary
 * by putting their own earlier on it. The fallbacks that follow exist because
 * a service unit, a launch agent and a scheduled task all start with a
 * minimal `PATH` that contains none of the usual install locations. The
 * entries are the default install directories of the Proton Pass CLI
 * installer on each host, with Homebrew's Apple Silicon prefix included
 * because it is not on a launch agent's `PATH`.
 *
 * @param platform - the host family
 * @param env - the process environment
 * @param home - the home directory, from `homeDirectory`
 * @returns the directories to search, in order
 *
 * @example
 * import { executableSearchPath } from "@resnovas/opp-config"
 *
 * const dirs = executableSearchPath("darwin", { PATH: "/usr/bin" }, "/Users/jo")
 *
 * assert.strictEqual(dirs[0], "/usr/bin")
 * assert.strictEqual(dirs.includes("/opt/homebrew/bin"), true)
 */
export const executableSearchPath = (
  platform: HostPlatform,
  env: Environment,
  home: string
): ReadonlyArray<string> => {
  const { delimiter, join } = rules(platform)
  const fromPath = (env["PATH"] ?? "").split(delimiter).filter((entry) => entry.trim() !== "")
  if (platform === "win32") {
    const local = set(env, "LOCALAPPDATA") ?? join(home, "AppData", "Local")
    return [
      ...fromPath,
      join(local, "Programs", "pass-cli"),
      join(local, "pass-cli"),
      join(home, ".local", "bin")
    ]
  }
  const unix = [join(home, ".local", "bin"), "/usr/local/bin", "/usr/bin"]
  return platform === "darwin"
    ? [...fromPath, join(home, ".local", "bin"), "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"]
    : [...fromPath, ...unix]
}

/**
 * Decide what should supervise the proxy on this host.
 *
 * @remarks
 * Pure and total. Linux reports `systemd` only when the caller has found a
 * running systemd, because a container image is a Linux host with no init
 * system to register a unit with, and writing one there produces a file that
 * can never be enabled. The caller performs that detection, so this function
 * stays pure.
 *
 * @param platform - the host family
 * @param systemdAvailable - whether a running systemd was detected
 * @returns the supervisor to generate configuration for
 *
 * @example
 * import { serviceManagerFor } from "@resnovas/opp-config"
 *
 * assert.strictEqual(serviceManagerFor("linux", true), "systemd")
 * assert.strictEqual(serviceManagerFor("linux", false), "none")
 * assert.strictEqual(serviceManagerFor("darwin", false), "launchd")
 * assert.strictEqual(serviceManagerFor("win32", false), "schtasks")
 */
export const serviceManagerFor = (
  platform: HostPlatform,
  systemdAvailable: boolean
): ServiceManager => {
  if (platform === "darwin") return "launchd"
  if (platform === "win32") return "schtasks"
  return systemdAvailable ? "systemd" : "none"
}
