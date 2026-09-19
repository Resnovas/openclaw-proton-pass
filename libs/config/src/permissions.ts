/*
 * Project: openclaw-proton-pass
 * File: permissions.ts
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
 * Restricting a file or directory to the account that owns it.
 *
 * This system stores an agent token and a map of vault locations on disk, so
 * every file it creates is locked down as it is created. How that is done
 * differs by host, and `chmod` silently does nothing on Windows, so the
 * difference is handled here rather than assumed away.
 *
 * @module
 * @since 0.1.0
 */

import { Command, CommandExecutor, FileSystem } from "@effect/platform"
import { Config, Effect, Option } from "effect"
import type { HostPlatform } from "./host.js"

/**
 * What a path holds, which decides how tightly it is locked down.
 *
 * @category models
 * @since 0.1.0
 */
export type PathKind = "file" | "directory"

/**
 * The POSIX mode a path of this kind should carry.
 *
 * @remarks
 * Pure and total. A directory needs the execute bit to be traversable by its
 * owner, which a file does not, so the two differ by more than a constant.
 *
 * @param kind - whether the path is a file or a directory
 * @returns the mode to apply, owner only
 *
 * @example
 * import { ownerOnlyMode } from "@resnovas/opp-config"
 *
 * assert.strictEqual(ownerOnlyMode("file"), 0o600)
 * assert.strictEqual(ownerOnlyMode("directory"), 0o700)
 */
export const ownerOnlyMode = (kind: PathKind): number => (kind === "directory" ? 0o700 : 0o600)

/**
 * The `icacls` arguments that reduce a path to one account.
 *
 * @remarks
 * Pure and total. `/inheritance:r` drops the permissions the path inherited
 * from its parent, which is the part that matters: without it the grant is
 * added to an existing set rather than replacing it, and the path stays
 * readable by whoever the parent allowed. `/grant:r` then replaces any
 * existing entry for that account rather than adding a second one, so the
 * call is safe to repeat.
 *
 * @param target - the path to restrict
 * @param account - the account to leave with full control
 * @returns the arguments to pass to `icacls`
 *
 * @example
 * import { icaclsArguments } from "@resnovas/opp-config"
 *
 * assert.deepStrictEqual(
 *   icaclsArguments("C:\\Users\\jo\\token", "jo"),
 *   ["C:\\Users\\jo\\token", "/inheritance:r", "/grant:r", "jo:F"]
 * )
 */
export const icaclsArguments = (
  target: string,
  account: string
): ReadonlyArray<string> => [target, "/inheritance:r", "/grant:r", `${account}:F`]

/**
 * Restrict a path to the account that owns it.
 *
 * @remarks
 * Never fails. A tightened permission is a defence, not a precondition: the
 * install is still usable if it cannot be applied, and taking `setup` down
 * over it would leave the operator with a half-written configuration
 * directory. On Windows the account name comes from the environment, and
 * nothing is attempted when it is absent, because guessing an account and
 * granting it full control is worse than leaving the profile's own
 * permissions in place.
 *
 * @param platform - the host family
 * @param target - the path to restrict
 * @param kind - whether the path is a file or a directory
 * @returns an Effect that completes once the attempt has been made
 *
 * @example
 * import { restrictToOwner } from "@resnovas/opp-config"
 * import { Effect } from "effect"
 *
 * // Nothing has happened yet: the restriction is described, not performed.
 * assert.strictEqual(Effect.isEffect(restrictToOwner("linux", "/tmp/x", "file")), true)
 */
export const restrictToOwner = (
  platform: HostPlatform,
  target: string,
  kind: PathKind
): Effect.Effect<void, never, FileSystem.FileSystem | CommandExecutor.CommandExecutor> =>
  platform === "win32"
    ? Effect.gen(function* () {
        const account = yield* Config.string("USERNAME").pipe(
          Config.map((value) => value.trim()),
          Config.option,
          Effect.orElseSucceed(() => Option.none<string>())
        )
        if (Option.isNone(account) || account.value === "") {
          yield* Effect.logWarning(
            `USERNAME is unset, so the permissions on ${target} were left as inherited`
          )
          return
        }
        yield* Command.make("icacls", ...icaclsArguments(target, account.value)).pipe(
          Command.exitCode,
          Effect.flatMap((code) =>
            code === 0
              ? Effect.void
              : Effect.logWarning(`icacls exited ${code}; ${target} keeps inherited permissions`)
          ),
          Effect.catchAll(() =>
            Effect.logWarning(`icacls could not be run; ${target} keeps inherited permissions`)
          )
        )
      })
    : Effect.flatMap(FileSystem.FileSystem, (fs) =>
        fs
          .chmod(target, ownerOnlyMode(kind))
          .pipe(
            Effect.catchAll(() =>
              Effect.logWarning(`could not set the mode on ${target}; check it by hand`)
            )
          )
      )
