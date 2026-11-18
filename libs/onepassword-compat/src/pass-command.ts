/*
 * Project: openclaw-proton-pass
 * File: pass-command.ts
 * Last Modified: 2026-09-20
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
 * Spawn pass-cli subcommands and decode JSON responses.
 *
 * @module
 * @since 0.1.0
 */

import { Command, CommandExecutor } from "@effect/platform"
import { commandTimeoutMillis, Paths } from "@resnovas/opp-config"
import { Effect, Schema, Stream } from "effect"
import { CliExit } from "./errors.js"
import {
  normaliseProtonItemView,
  normaliseProtonItemsList,
  normaliseProtonVaults,
  PassInfoJson as PassInfoJsonSchema,
  PassItemViewJson as PassItemViewJsonSchema,
  PassItemsListJson as PassItemsListJsonSchema,
  PassVaultListJson as PassVaultListJsonSchema,
  type PassInfoJson
} from "./proton-json.js"

export type PassCommandRequirements =
  | Paths
  | typeof commandTimeoutMillis
  | CommandExecutor.CommandExecutor

/**
 * Environment block shared with {@link PassSession}.
 *
 * @category models
 * @since 0.1.0
 */
export type PassCommandEnv = Readonly<Record<string, string>>

/**
 * Run one pass-cli invocation and decode JSON stdout.
 *
 * @remarks
 * Uses exit code rather than stdout alone: pass-cli may print partial output
 * before failing. Stderr is captured for {@link CliExit}.
 *
 * @param args - pass-cli arguments after the binary name
 * @param schema - schema for the decoded JSON body
 * @param env - session environment including `PROTON_PASS_SESSION_DIR`
 * @returns the decoded JSON value
 *
 * @category utils
 * @since 0.1.0
 *
 * @example
 * import { runPassJson, PassVaultListJson } from "@resnovas/opp-onepassword-compat"
 * import { Effect, Schema } from "effect"
 *
 * const program = runPassJson(
 *   ["vault", "list", "--output", "json"],
 *   PassVaultListJson,
 *   { PROTON_PASS_SESSION_DIR: "/tmp/session" }
 * )
 *
 * assert.strictEqual(Effect.isEffect(program), true)
 * assert.strictEqual(Schema.isSchema(PassVaultListJson), true)
 */
export const runPassJson = <A, I>(
  args: ReadonlyArray<string>,
  schema: Schema.Schema<A, I>,
  env: PassCommandEnv
): Effect.Effect<A, CliExit, PassCommandRequirements> =>
  Effect.gen(function* () {
    const paths = yield* Paths
    const timeoutMillis = yield* commandTimeoutMillis.pipe(
      Effect.mapError(
        (cause) =>
          new CliExit({
            exitCode: 1,
            stderr: `command timeout config: ${String(cause)}`,
            command: paths.passCli
          })
      )
    )
    const decode = Schema.decodeUnknown(schema)

    const output = yield* Effect.scoped(
      Effect.gen(function* () {
        const process = yield* Command.make(paths.passCli, ...args).pipe(
          Command.env(env),
          Command.start
        )
        const stdout = yield* process.stdout.pipe(Stream.decodeText(), Stream.mkString)
        const stderr = yield* process.stderr.pipe(Stream.decodeText(), Stream.mkString)
        const code = yield* process.exitCode
        if (code !== 0) {
          return yield* new CliExit({
            exitCode: code,
            stderr,
            command: [paths.passCli, ...args].join(" ")
          })
        }
        return { stdout, stderr }
      })
    ).pipe(
      Effect.timeout(timeoutMillis),
      Effect.catchAll((cause) =>
        cause instanceof CliExit
          ? Effect.fail(cause)
          : Effect.fail(
              new CliExit({
                exitCode: 1,
                stderr: String(cause),
                command: [paths.passCli, ...args].join(" ")
              })
            )
      )
    )

    const parsed = yield* Effect.try({
      try: () => JSON.parse(output.stdout) as unknown,
      catch: (cause) =>
        new CliExit({
          exitCode: 1,
          stderr: `invalid JSON from pass-cli: ${String(cause)}`,
          command: [paths.passCli, ...args].join(" ")
        })
    })

    return yield* decode(parsed).pipe(
      Effect.mapError(
        (cause) =>
          new CliExit({
            exitCode: 1,
            stderr: `pass-cli JSON did not match schema: ${String(cause)}`,
            command: [paths.passCli, ...args].join(" ")
          })
      )
    )
  })

/**
 * Run pass-cli and return raw stdout text.
 *
 * @remarks
 * Used for field reads where pass-cli prints a single value rather than JSON.
 * Non-zero exit codes become {@link CliExit}.
 *
 * @param args - pass-cli arguments after the binary name
 * @param env - session environment
 * @returns stdout text on success
 *
 * @category utils
 * @since 0.1.0
 *
 * @example
 * import { runPassText } from "@resnovas/opp-onepassword-compat"
 * import { Effect } from "effect"
 *
 * const program = runPassText(
 *   ["item", "view", "pass://OpenClaw/example/password"],
 *   { PROTON_PASS_SESSION_DIR: "/tmp/session" }
 * )
 *
 * assert.strictEqual(Effect.isEffect(program), true)
 */
export const runPassText = (
  args: ReadonlyArray<string>,
  env: PassCommandEnv
): Effect.Effect<string, CliExit, PassCommandRequirements> =>
  Effect.gen(function* () {
    const paths = yield* Paths
    const timeoutMillis = yield* commandTimeoutMillis.pipe(
      Effect.mapError(
        (cause) =>
          new CliExit({
            exitCode: 1,
            stderr: `command timeout config: ${String(cause)}`,
            command: paths.passCli
          })
      )
    )

    return yield* Effect.scoped(
      Effect.gen(function* () {
        const process = yield* Command.make(paths.passCli, ...args).pipe(
          Command.env(env),
          Command.start
        )
        const stdout = yield* process.stdout.pipe(Stream.decodeText(), Stream.mkString)
        const stderr = yield* process.stderr.pipe(Stream.decodeText(), Stream.mkString)
        const code = yield* process.exitCode
        if (code !== 0) {
          return yield* new CliExit({
            exitCode: code,
            stderr,
            command: [paths.passCli, ...args].join(" ")
          })
        }
        return stdout.trimEnd()
      })
    ).pipe(
      Effect.timeout(timeoutMillis),
      Effect.catchAll((cause) =>
        cause instanceof CliExit
          ? Effect.fail(cause)
          : Effect.fail(
              new CliExit({
                exitCode: 1,
                stderr: String(cause),
                command: [paths.passCli, ...args].join(" ")
              })
            )
      )
    )
  })

/**
 * List vaults through pass-cli JSON output.
 *
 * @remarks
 * Calls `pass-cli vault list --output json` and normalises share ids for
 * Connect vault ids.
 *
 * @param env - session environment
 * @returns normalised vault entries
 *
 * @category utils
 * @since 0.1.0
 *
 * @example
 * import { vaultList } from "@resnovas/opp-onepassword-compat"
 * import { Effect } from "effect"
 *
 * assert.strictEqual(
 *   Effect.isEffect(vaultList({ PROTON_PASS_SESSION_DIR: "/tmp/session" })),
 *   true
 * )
 */
export const vaultList = (
  env: PassCommandEnv
): Effect.Effect<
  ReturnType<typeof normaliseProtonVaults>,
  CliExit,
  PassCommandRequirements
> =>
  runPassJson(["vault", "list", "--output", "json"], PassVaultListJsonSchema, env).pipe(
    Effect.map((body) => normaliseProtonVaults(body))
  )

/**
 * List items in one vault through pass-cli JSON output.
 *
 * @remarks
 * Returns summaries without secret field values, matching Connect list items.
 *
 * @param vault - vault share id or name
 * @param env - session environment
 * @returns normalised item summaries
 *
 * @category utils
 * @since 0.1.0
 *
 * @example
 * import { itemList } from "@resnovas/opp-onepassword-compat"
 * import { Effect } from "effect"
 *
 * assert.strictEqual(
 *   Effect.isEffect(itemList("share-1", { PROTON_PASS_SESSION_DIR: "/tmp/session" })),
 *   true
 * )
 */
export const itemList = (
  vault: string,
  env: PassCommandEnv
): Effect.Effect<
  ReturnType<typeof normaliseProtonItemsList>,
  CliExit,
  PassCommandRequirements
> =>
  runPassJson(
    ["item", "list", "--share-id", vault, "--output", "json"],
    PassItemsListJsonSchema,
    env
  ).pipe(Effect.map((body) => normaliseProtonItemsList(body)))

/**
 * View one item through pass-cli JSON output.
 *
 * @remarks
 * Decodes the full item including concealed fields for Connect get item.
 *
 * @param shareId - vault share id
 * @param itemId - item id
 * @param env - session environment
 * @returns normalised full item
 *
 * @category utils
 * @since 0.1.0
 *
 * @example
 * import { itemView } from "@resnovas/opp-onepassword-compat"
 * import { Effect } from "effect"
 *
 * assert.strictEqual(
 *   Effect.isEffect(
 *     itemView("share-1", "item-1", { PROTON_PASS_SESSION_DIR: "/tmp/session" })
 *   ),
 *   true
 * )
 */
export const itemView = (
  shareId: string,
  itemId: string,
  env: PassCommandEnv
): Effect.Effect<
  ReturnType<typeof normaliseProtonItemView>,
  CliExit,
  PassCommandRequirements
> =>
  runPassJson(
    ["item", "view", "--share-id", shareId, "--item-id", itemId, "--output", "json"],
    PassItemViewJsonSchema,
    env
  ).pipe(Effect.map((body) => normaliseProtonItemView(body)))

/**
 * Read one field value through a pass URI.
 *
 * @remarks
 * The returned string is not redacted here; callers must wrap it before
 * logging or crossing a protocol boundary.
 *
 * @param passRef - a `pass://` reference
 * @param env - session environment
 * @returns the raw field value text
 *
 * @category utils
 * @since 0.1.0
 *
 * @example
 * import { itemViewField } from "@resnovas/opp-onepassword-compat"
 * import { Effect } from "effect"
 *
 * assert.strictEqual(
 *   Effect.isEffect(
 *     itemViewField("pass://OpenClaw/example/password", {
 *       PROTON_PASS_SESSION_DIR: "/tmp/session"
 *     })
 *   ),
 *   true
 * )
 */
export const itemViewField = (
  passRef: string,
  env: PassCommandEnv
): Effect.Effect<string, CliExit, PassCommandRequirements> =>
  runPassText(["item", "view", passRef], env)

/**
 * Read session info through pass-cli JSON output.
 *
 * @remarks
 * Used by {@link OnePasswordCompat.whoami} after the session is established.
 *
 * @param env - session environment
 * @returns parsed session info
 *
 * @category utils
 * @since 0.1.0
 *
 * @example
 * import { sessionInfo } from "@resnovas/opp-onepassword-compat"
 * import { Effect } from "effect"
 *
 * assert.strictEqual(
 *   Effect.isEffect(sessionInfo({ PROTON_PASS_SESSION_DIR: "/tmp/session" })),
 *   true
 * )
 */
export const sessionInfo = (
  env: PassCommandEnv
): Effect.Effect<PassInfoJson, CliExit, PassCommandRequirements> =>
  runPassJson(["info", "--output", "json"], PassInfoJsonSchema, env)

export type { PassInfoJson } from "./proton-json.js"
