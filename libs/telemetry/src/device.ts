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
import { arch, cpus, hostname, platform, release, totalmem } from "node:os"
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
 * A stable, pseudonymous identifier for this install.
 *
 * Persisted so the same machine is recognisable across runs, which is what
 * makes "this one host keeps failing" answerable at all. It is a random UUID
 * rather than anything derived from the machine, so it identifies an install
 * without encoding what that machine is; deleting the file starts a new
 * identity.
 *
 * When the file cannot be written — a read-only or ephemeral filesystem — a
 * hash of stable machine attributes stands in, so repeated runs from one host
 * still group together instead of each looking like a new install.
 */
export const installId = Effect.gen(function* () {
  const paths = yield* Paths
  const fs = yield* FileSystem.FileSystem
  const file = join(paths.configDir, "install-id")

  const existing = yield* fs.readFileString(file).pipe(
    Effect.map((contents) => contents.trim()),
    Effect.orElseSucceed(() => "")
  )
  if (existing !== "") return existing

  const generated = randomUUID()
  const written = yield* fs
    .makeDirectory(paths.configDir, { recursive: true })
    .pipe(
      Effect.zipRight(fs.writeFileString(file, `${generated}\n`)),
      Effect.zipRight(fs.chmod(file, 0o600)),
      Effect.as(true),
      Effect.orElseSucceed(() => false)
    )
  if (written) return generated

  // Derived rather than random, so an install that cannot persist anything
  // still reports consistently instead of looking like a new host each run.
  const fingerprint = [hostname(), platform(), arch(), paths.configDir].join("|")
  return `derived-${createHash("sha256").update(fingerprint).digest("hex").slice(0, 32)}`
})

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
