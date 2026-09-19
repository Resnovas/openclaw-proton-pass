/*
 * Project: openclaw-proton-pass
 * File: device.ts
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

import { Command, FileSystem } from "@effect/platform"
import { Paths } from "@resnovas/opp-config"
import { Effect } from "effect"
import { createHash, randomUUID } from "node:crypto"
import { arch, cpus, homedir, hostname, platform, release, totalmem } from "node:os"
import { join } from "node:path"

/**
 * What an install looks like, for diagnosis.
 *
 * These values describe the machine rather than the data passing through it.
 * That distinction is why they are allowed to be free-form strings while event
 * properties are not: every one is read from `node:os`, `process`, or a version
 * command, so none can be a credential, a vault reference, or anything an
 * operator typed.
 */
export interface DeviceContext {
  readonly hostname: string
  readonly os: string
  readonly osRelease: string
  readonly arch: string
  readonly nodeVersion: string
  readonly npmVersion: string
  readonly pnpmVersion: string
  readonly passCliVersion: string
  readonly cpuCount: number
  readonly memoryGb: number
  readonly timezone: string
  readonly isCi: boolean
  readonly installedAsPlugin: boolean
  readonly appVersion: string
}

/** How long a cached device profile stays fresh. */
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000

/** Read a `--version` from a command, or report that it is absent. */
const versionOf = (command: string, ...args: ReadonlyArray<string>) =>
  Command.make(command, ...args).pipe(
    Command.string,
    Effect.map((output) => output.trim().split("\n")[0] || "unknown"),
    Effect.timeout(5000),
    Effect.orElseSucceed(() => "absent")
  )

/**
 * Constant mixed into every derived identifier.
 *
 * A machine id is shared with everything else on the host that reads it, so
 * hashing it with a salt specific to this project means the value reported here
 * cannot be lined up against the same machine's identifier as seen by anything
 * else. The raw identifier never leaves the machine.
 */
const ID_SALT = "openclaw-proton-pass/install-id/v1"

/** Files holding a machine identifier, in the order they are trusted. */
const MACHINE_ID_FILES = ["/etc/machine-id", "/var/lib/dbus/machine-id"]

/**
 * A stable, pseudonymous identifier for this machine.
 *
 * Derived from the host's machine id rather than stored beside the
 * configuration. Keying it to the config directory looked simpler, but it meant
 * one machine reported as a different install every time that directory moved —
 * a changed `OPENCLAW_PROTONPASS_CONFIG_DIR`, a container, an ephemeral home,
 * or a test run against a temporary directory. Counting those as separate
 * installs makes every per-install question meaningless.
 *
 * The machine id is salted and hashed, so what leaves the machine identifies it
 * consistently without disclosing the identifier itself or being correlatable
 * with any other product that reads the same file.
 *
 * Where no machine id exists, a UUID persisted under the state directory stands
 * in; that path does not move when the configuration directory is overridden.
 * Where nothing can be written either, a hash of durable machine attributes is
 * the last resort, so a read-only or ephemeral host still reports consistently.
 */
export const installIdFrom = (machineIdFiles: ReadonlyArray<string>) =>
  Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem

  const digest = (value: string) =>
    createHash("sha256").update(`${ID_SALT}|${value}`).digest("hex").slice(0, 32)

  for (const file of machineIdFiles) {
    const contents = yield* fs.readFileString(file).pipe(
      Effect.map((text) => text.trim()),
      Effect.orElseSucceed(() => "")
    )
    if (contents !== "") return digest(contents)
  }

  // Not tied to the configuration directory: an identity that moves with the
  // config is exactly the bug this function exists to avoid.
  // homedir() rather than the HOME variable: it always yields a path, and it
  // is what the OS actually considers home when the variable is absent.
  const stateHome = process.env["XDG_STATE_HOME"] ?? join(homedir(), ".local", "state")
  const stateDir = join(stateHome, "openclaw-proton-pass")
  const file = join(stateDir, "install-id")

  const existing = yield* fs.readFileString(file).pipe(
    Effect.map((contents) => contents.trim()),
    Effect.orElseSucceed(() => "")
  )
  if (existing !== "") return existing

  const generated = randomUUID()
  const written = yield* fs
    .makeDirectory(stateDir, { recursive: true })
    .pipe(
      Effect.zipRight(fs.writeFileString(file, `${generated}\n`)),
      Effect.zipRight(fs.chmod(file, 0o600)),
      Effect.as(true),
      Effect.orElseSucceed(() => false)
    )
  if (written) return generated

  return `derived-${digest([hostname(), platform(), arch()].join("|"))}`
})

/**
 * This machine's identifier.
 *
 * The file list is a parameter of {@link installIdFrom} so the fallbacks can be
 * exercised: on any host that has a machine id, they are otherwise unreachable
 * and would ship untested.
 */
export const installId = installIdFrom(MACHINE_ID_FILES)

/**
 * Describe this machine.
 *
 * The version lookups spawn processes, which is too expensive for a resolver
 * the Gateway invokes per request, so the profile is cached and refreshed
 * weekly. Everything cheap is read fresh each time.
 */
export const deviceContext = Effect.gen(function* () {
  const paths = yield* Paths
  const fs = yield* FileSystem.FileSystem
  const cacheFile = join(paths.configDir, "device-profile.json")

  const cached = yield* fs.readFileString(cacheFile).pipe(
    Effect.flatMap((contents) =>
      Effect.try(() => JSON.parse(contents) as { at: number; versions: Record<string, string> })
    ),
    Effect.orElseSucceed(() => undefined)
  )

  const fresh = cached !== undefined && Date.now() - cached.at < CACHE_TTL_MS
  const versions = fresh
    ? cached.versions
    : {
        npm: yield* versionOf("npm", "--version"),
        pnpm: yield* versionOf("pnpm", "--version"),
        passCli: yield* versionOf(paths.passCli, "--version")
      }

  if (!fresh) {
    yield* fs
      .writeFileString(cacheFile, JSON.stringify({ at: Date.now(), versions }))
      .pipe(Effect.ignore)
  }

  const context: DeviceContext = {
    hostname: hostname(),
    os: platform(),
    osRelease: release(),
    arch: arch(),
    nodeVersion: process.versions.node,
    npmVersion: versions["npm"] ?? "unknown",
    pnpmVersion: versions["pnpm"] ?? "unknown",
    passCliVersion: versions["passCli"] ?? "unknown",
    cpuCount: cpus().length,
    memoryGb: Math.round((totalmem() / 1024 ** 3) * 10) / 10,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    isCi: process.env["CI"] === "true" || process.env["CI"] === "1",
    // A plugin install lands under OpenClaw's managed plugin roots.
    installedAsPlugin: import.meta.url.includes("/plugins/"),
    appVersion: process.env["OPP_VERSION"] ?? "dev"
  }
  return context
})
