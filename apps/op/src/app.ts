/*
 * Project: openclaw-proton-pass
 * File: app.ts
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
 * The 1Password CLI compatibility command tree.
 *
 * Maps `op` subcommands onto {@link OnePasswordCompat} and Proton Pass. Secrets
 * stay {@link Redacted} until the stdout write or child environment boundary.
 *
 * @module
 * @since 0.1.0
 */

import { Args, Command as Cli, Options } from "@effect/cli"
import { Command } from "@effect/platform"
import { NodeContext } from "@effect/platform-node"
import { auditContext, Paths, StderrLoggerLive } from "@resnovas/opp-config"
import type { CliFormat, Field, FullItem, Vault } from "@resnovas/opp-onepassword-contract"
import { parseOpSecretRef } from "@resnovas/opp-onepassword-contract"
import {
  AuthError,
  CliExit,
  CliUnsupported,
  ConnectNotFound,
  formatCliError,
  ItemError,
  OnePasswordCompat,
  opSecretRefToPassRef,
  VaultError,
  type CliEncodableError
} from "@resnovas/opp-onepassword-compat"
import { auditReason, PassSession } from "@resnovas/opp-pass-cli"
import { Telemetry } from "@resnovas/opp-telemetry"
import { Effect, Layer, Option, Redacted } from "effect"
import { parseRunArgv } from "./argv.js"
import { resolveFormat } from "./format.js"
import { failUnsupported } from "./unsupported.js"

/** Exit codes, following sysexits so a supervisor can tell the cases apart. */
const EX_USAGE = 64
const EX_UNAVAILABLE = 69

const OP_REF_PATTERN = /op:\/\/[^\s"'`]+/g

const formatOption = Options.choice("format", ["human", "json"] as const).pipe(Options.optional)

const vaultOption = Options.text("vault").pipe(
  Options.withAlias("v"),
  Options.withDescription("vault containing the item")
)

const revealOption = Options.boolean("reveal").pipe(
  Options.withDefault(false),
  Options.withDescription("include concealed field values")
)

const otpOption = Options.boolean("otp").pipe(
  Options.withDefault(false),
  Options.withDescription("return the one-time password for the item")
)

const writeStdout = (text: string) =>
  Effect.sync(() => {
    process.stdout.write(text)
  })

const writeSecretStdout = (secret: Redacted.Redacted<string>, format: CliFormat) => {
  if (format === "json") {
    return writeStdout(`${JSON.stringify({ value: Redacted.value(secret) })}\n`)
  }
  return writeStdout(`${Redacted.value(secret)}\n`)
}

const encodeJson = (value: unknown) => writeStdout(`${JSON.stringify(value, null, 2)}\n`)

const encodeVaultHuman = (vault: Vault) =>
  writeStdout(`ID:          ${vault.id ?? ""}\nName:        ${vault.name ?? ""}\n`)

const encodeVaultsHuman = (vaults: ReadonlyArray<Vault>) =>
  Effect.forEach(vaults, (vault) => encodeVaultHuman(vault))

const encodeWhoamiHuman = (whoami: {
  readonly accountUuid: string
  readonly email?: string
  readonly name?: string
}) => {
  const lines = [
    `Account UUID: ${whoami.accountUuid}`,
    ...(whoami.email === undefined ? [] : [`Email:        ${whoami.email}`]),
    ...(whoami.name === undefined ? [] : [`Name:         ${whoami.name}`])
  ]
  return writeStdout(`${lines.join("\n")}\n`)
}

const concealField = (field: Field, reveal: boolean): Field => {
  if (reveal || (field.type !== "CONCEALED" && field.type !== "TOTP")) return field
  return { ...field, value: undefined }
}

const concealItem = (item: FullItem, reveal: boolean): FullItem => {
  if (reveal || item.fields === undefined) return item
  return {
    ...item,
    fields: item.fields.map((field) => concealField(field, reveal))
  }
}

const toCliError = (error: unknown): CliEncodableError => {
  if (
    error instanceof CliUnsupported ||
    error instanceof CliExit ||
    error instanceof AuthError ||
    error instanceof VaultError ||
    error instanceof ItemError
  ) {
    return error
  }
  if (error instanceof ConnectNotFound) {
    return new ItemError({ reason: error.message })
  }
  if (error !== null && typeof error === "object" && "_tag" in error) {
    const tagged = error as { readonly _tag: string; readonly reason?: string; readonly message?: string }
    if (tagged._tag === "OpSecretRefParseError") {
      return new ItemError({ reason: tagged.reason ?? tagged.message ?? "invalid secret reference" })
    }
  }
  return new ItemError({ reason: String(error) })
}

const reportError = (error: unknown, format: CliFormat) =>
  Effect.gen(function* () {
    const message = formatCliError(toCliError(error), format)
    yield* Effect.sync(() => {
      process.stderr.write(`${message}\n`)
      process.exitCode = 1
    })
  })

const withReporting =
  <A, E, R>(effect: Effect.Effect<A, E, R>, format: CliFormat) =>
    effect.pipe(
      Effect.catchAll((error) =>
        reportError(error, format).pipe(Effect.flatMap(() => Effect.fail(error)))
      )
    )

const readStdin = Effect.tryPromise({
  try: async () => {
    const chunks: Array<Buffer> = []
    for await (const chunk of process.stdin) {
      chunks.push(chunk as Buffer)
    }
    return Buffer.concat(chunks).toString("utf8")
  },
  catch: (cause) => new ItemError({ reason: `could not read stdin: ${String(cause)}` })
})

const substituteOpRefs = (template: string) =>
  Effect.gen(function* () {
    const compat = yield* OnePasswordCompat
    const matches = [...new Set(template.match(OP_REF_PATTERN) ?? [])].sort(
      (left, right) => right.length - left.length
    )
    let output = template
    for (const uri of matches) {
      const secret = yield* compat.readSecretUri(uri)
      output = output.replaceAll(uri, Redacted.value(secret))
    }
    return output
  })

const runChild = (rawArgv: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const paths = yield* Paths
    const session = yield* PassSession
    const context = yield* auditContext
    const argv = parseRunArgv(rawArgv)
    const command = argv[0]
    if (command === undefined) {
      yield* Effect.sync(() => {
        process.exitCode = EX_USAGE
      })
      yield* Effect.logError("op run: no command given\nusage: op run -- <command> [args...]")
      return
    }

    const ready = yield* session.ensure.pipe(Effect.either)
    if (ready._tag === "Left") {
      yield* Effect.sync(() => {
        process.exitCode = EX_UNAVAILABLE
      })
      yield* Effect.logError(
        `op run: could not establish a Proton Pass agent session (${ready.left._tag})\n` +
          `  check: PROTON_PASS_SESSION_DIR=${paths.sessionDir} ${paths.passCli} info`
      )
      return
    }

    const opEntries = Object.entries(process.env).filter(
      (entry): entry is [string, string] =>
        entry[1] !== undefined && entry[1].startsWith("op://")
    )
    const converted = yield* Effect.forEach(opEntries, ([name, value]) =>
      parseOpSecretRef(value).pipe(
        Effect.map((ref) => [name, opSecretRefToPassRef(ref)] as const),
        Effect.mapError(
          (cause) => new ItemError({ reason: cause.reason })
        )
      )
    )
    const referenced = converted.map(([name]) => name).sort()
    const substituted = Object.fromEntries(converted)

    const exitCode = yield* Command.make(paths.passCli, "run", "--", ...argv).pipe(
      Command.env({
        ...process.env,
        ...session.baseEnv,
        ...substituted,
        PROTON_PASS_AGENT_REASON: auditReason(
          { binary: "opp-op", target: `command ${command}` },
          referenced,
          {
            label: Option.getOrUndefined(context.label),
            profile: Option.getOrUndefined(context.profile)
          }
        )
      }),
      Command.stdin("inherit"),
      Command.stdout("inherit"),
      Command.stderr("inherit"),
      Command.exitCode,
      Effect.mapError(
        (cause) =>
          new CliExit({
            exitCode: 1,
            stderr: String(cause),
            command: [paths.passCli, "run", "--", ...argv].join(" ")
          })
      )
    )

    yield* Effect.sync(() => {
      process.exitCode = exitCode
    })
  })

const unsupported =
  (command: string, feature: string, limitation: string, suggestion?: string) =>
  (format: CliFormat) =>
    failUnsupported(
      {
        command,
        feature,
        limitation,
        ...(suggestion === undefined ? {} : { suggestion })
      },
      format
    )

const whoamiCommand = Cli.make("whoami", { format: formatOption }, ({ format }) =>
  withReporting(
    Effect.gen(function* () {
      const compat = yield* OnePasswordCompat
      const resolved = resolveFormat(format)
      const whoami = yield* compat.whoami()
      if (resolved === "json") {
        yield* encodeJson(whoami)
      } else {
        yield* encodeWhoamiHuman(whoami)
      }
    }),
    resolveFormat(format)
  )
)

const readCommand = Cli.make(
  "read",
  { reference: Args.text({ name: "reference" }), format: formatOption },
  ({ reference, format }) =>
    withReporting(
      Effect.gen(function* () {
        const compat = yield* OnePasswordCompat
        const resolved = resolveFormat(format)
        const secret = yield* compat.readSecretUri(reference)
        yield* writeSecretStdout(secret, resolved)
      }),
      resolveFormat(format)
    )
)

const injectCommand = Cli.make("inject", { format: formatOption }, ({ format }) =>
  withReporting(
    Effect.gen(function* () {
      const template = yield* readStdin
      const output = yield* substituteOpRefs(template)
      yield* writeStdout(output)
    }),
    resolveFormat(format)
  )
)

const runCommand = Cli.make(
  "run",
  { args: Args.text({ name: "arg" }).pipe(Args.repeated) },
  ({ args }) => withReporting(runChild(args), "human")
)

const vaultListCommand = Cli.make("list", { format: formatOption }, ({ format }) =>
  withReporting(
    Effect.gen(function* () {
      const compat = yield* OnePasswordCompat
      const resolved = resolveFormat(format)
      const vaults = yield* compat.listVaults()
      if (resolved === "json") {
        yield* encodeJson(vaults)
      } else {
        yield* encodeVaultsHuman(vaults)
      }
    }),
    resolveFormat(format)
  )
)

const vaultGetCommand = Cli.make(
  "get",
  { vault: Args.text({ name: "vault" }), format: formatOption },
  ({ vault, format }) =>
    withReporting(
      Effect.gen(function* () {
        const compat = yield* OnePasswordCompat
        const resolved = resolveFormat(format)
        const result = yield* compat.getVault(vault)
        if (resolved === "json") {
          yield* encodeJson(result)
        } else {
          yield* encodeVaultHuman(result)
        }
      }),
      resolveFormat(format)
    )
)

const vaultCommand = Cli.make("vault").pipe(
  Cli.withSubcommands([vaultListCommand, vaultGetCommand])
)

const itemListCommand = Cli.make(
  "list",
  { vault: vaultOption, format: formatOption },
  ({ vault, format }) =>
    withReporting(
      Effect.gen(function* () {
        const compat = yield* OnePasswordCompat
        const resolved = resolveFormat(format)
        const items = yield* compat.listItems(vault)
        if (resolved === "json") {
          yield* encodeJson(items)
        } else {
          yield* Effect.forEach(items, (item) =>
            writeStdout(`${item.id ?? ""}\t${item.title ?? ""}\n`)
          )
        }
      }),
      resolveFormat(format)
    )
)

const itemGetCommand = Cli.make(
  "get",
  {
    item: Args.text({ name: "item" }),
    vault: vaultOption,
    format: formatOption,
    reveal: revealOption,
    otp: otpOption
  },
  ({ item, vault, format, reveal, otp }) =>
    withReporting(
      Effect.gen(function* () {
        const compat = yield* OnePasswordCompat
        const resolved = resolveFormat(format)
        if (otp) {
          const loadedForOtp = yield* compat.getItem(vault, item)
          const totpField = loadedForOtp.fields?.find((field) => field.type === "TOTP")
          if (totpField?.label === undefined) {
            return yield* new ItemError({ reason: "item has no one-time password field" })
          }
          const encodeOpPathSegment = (segment: string) => encodeURIComponent(segment)
          const secret = yield* compat.readSecretUri(
            `op://${encodeOpPathSegment(vault)}/${encodeOpPathSegment(loadedForOtp.title ?? item)}/${encodeOpPathSegment(totpField.label)}?attribute=otp`
          )
          yield* writeSecretStdout(secret, resolved)
          return
        }
        const loaded = yield* compat.getItem(vault, item)
        const output = concealItem(loaded, reveal)
        if (resolved === "json") {
          yield* encodeJson(output)
        } else {
          yield* writeStdout(`${output.title ?? item}\n`)
        }
      }),
      resolveFormat(format)
    )
)

const itemCreateCommand = Cli.make("create", { format: formatOption }, ({ format }) =>
  unsupported(
    "op item create",
    "item writes",
    "Item creation is not exposed through the Proton Pass compatibility alias.",
    "Use pass-cli item create instead."
  )(resolveFormat(format))
)

const itemEditCommand = Cli.make("edit", { format: formatOption }, ({ format }) =>
  unsupported(
    "op item edit",
    "item writes",
    "Item editing is not exposed through the Proton Pass compatibility alias.",
    "Use pass-cli item update instead."
  )(resolveFormat(format))
)

const itemDeleteCommand = Cli.make("delete", { format: formatOption }, ({ format }) =>
  unsupported(
    "op item delete",
    "item writes",
    "Item deletion is not exposed through the Proton Pass compatibility alias.",
    "Use pass-cli item trash instead."
  )(resolveFormat(format))
)

const itemMoveCommand = Cli.make("move", { format: formatOption }, ({ format }) =>
  unsupported(
    "op item move",
    "item writes",
    "Moving items between vaults is not exposed through the Proton Pass compatibility alias."
  )(resolveFormat(format))
)

const itemShareCommand = Cli.make("share", { format: formatOption }, ({ format }) =>
  unsupported(
    "op item share",
    "item sharing",
    "1Password item sharing has no Proton Pass equivalent."
  )(resolveFormat(format))
)

const itemCommand = Cli.make("item").pipe(
  Cli.withSubcommands([
    itemListCommand,
    itemGetCommand,
    itemCreateCommand,
    itemEditCommand,
    itemDeleteCommand,
    itemMoveCommand,
    itemShareCommand
  ])
)

const documentSubcommand = (name: string) =>
  Cli.make(name, { format: formatOption }, ({ format }) =>
    unsupported(
      `op document ${name}`,
      "documents",
      "1Password documents have no Proton Pass equivalent.",
      "Use pass-cli item create note for secure notes."
    )(resolveFormat(format))
  )

const documentCommand = Cli.make("document").pipe(
  Cli.withSubcommands([
    documentSubcommand("create"),
    documentSubcommand("delete"),
    documentSubcommand("edit"),
    documentSubcommand("get"),
    documentSubcommand("list")
  ])
)

const eventsApiSubcommand = (name: string) =>
  Cli.make(name, { format: formatOption }, ({ format }) =>
    unsupported(
      `op events-api ${name}`,
      "events API",
      "The 1Password Events API is not implemented in the Proton Pass compatibility layer."
    )(resolveFormat(format))
  )

const eventsApiCommand = Cli.make("events-api").pipe(
  Cli.withSubcommands([
    eventsApiSubcommand("create"),
    eventsApiSubcommand("list"),
    eventsApiSubcommand("get"),
    eventsApiSubcommand("update"),
    eventsApiSubcommand("delete")
  ])
)

const signinCommand = Cli.make("signin", { format: formatOption }, ({ format }) =>
  unsupported(
    "op signin",
    "desktop sign-in",
    "Desktop app sign-in is not available; configure a Proton Pass agent token instead.",
    "Run openclaw-proton-pass token with a pass-cli agent personal access token."
  )(resolveFormat(format))
)

const signoutCommand = Cli.make("signout", { format: formatOption }, ({ format }) =>
  unsupported(
    "op signout",
    "desktop sign-out",
    "Desktop app sign-out is not available in the Proton Pass compatibility layer."
  )(resolveFormat(format))
)

const userSubcommand = (name: string) =>
  Cli.make(name, { format: formatOption }, ({ format }) =>
    unsupported(
      `op user ${name}`,
      "user administration",
      "1Password user administration is not implemented in the Proton Pass compatibility layer."
    )(resolveFormat(format))
  )

const userCommand = Cli.make("user").pipe(
  Cli.withSubcommands([
    userSubcommand("get"),
    userSubcommand("list"),
    userSubcommand("provision")
  ])
)

const pluginCommand = Cli.make("plugin", { format: formatOption }, ({ format }) =>
  unsupported(
    "op plugin",
    "shell plugins",
    "1Password shell plugins are not implemented in the Proton Pass compatibility layer."
  )(resolveFormat(format))
)

const completionCommand = Cli.make("completion", { format: formatOption }, ({ format }) =>
  unsupported(
    "op completion",
    "shell completion",
    "Shell completion is not generated for opp-op."
  )(resolveFormat(format))
)

const root = Cli.make("op").pipe(
  Cli.withSubcommands([
    whoamiCommand,
    readCommand,
    runCommand,
    injectCommand,
    vaultCommand,
    itemCommand,
    documentCommand,
    eventsApiCommand,
    signinCommand,
    signoutCommand,
    userCommand,
    pluginCommand,
    completionCommand
  ])
)

/**
 * Run the 1Password compatibility CLI.
 *
 * @remarks
 * Parses `process.argv` and dispatches to a subcommand. Requires the services
 * in {@link layer}. Exits non-zero when a subcommand fails.
 *
 * @param args - the full `process.argv`
 * @returns an Effect that completes when the subcommand has finished
 *
 * @category entrypoints
 * @since 0.1.0
 *
 * @example
 * import { run } from "@resnovas/opp-op/app"
 * import { Effect } from "effect"
 *
 * assert.strictEqual(Effect.isEffect(run(["node", "opp-op", "--help"])), true)
 */
export const run = Cli.run(root, {
  name: "op",
  version: "0.1.0"
})

/**
 * Normalise unknown CLI failures for stderr formatting.
 *
 * @remarks
 * Exported so tests can assert the generic fallback path without reaching
 * through a full command dispatch.
 *
 * @param error - the failure to normalise
 * @returns a CLI-encodable error for stderr formatting
 *
 * @category entrypoints
 * @since 0.1.0
 *
 * @example
 * import { normalizeCliError } from "@resnovas/opp-op/app"
 * import { ItemError } from "@resnovas/opp-onepassword-compat"
 *
 * const error = normalizeCliError(new Error("unexpected failure"))
 * assert.strictEqual(error instanceof ItemError, true)
 * assert.match(error.reason, /unexpected failure/)
 */
export const normalizeCliError = toCliError

/**
 * Entry point used by {@link main}.
 *
 * @category entrypoints
 * @since 0.1.0
 */
export const main = run(process.argv)

/**
 * Everything the CLI needs in order to run.
 *
 * @category entrypoints
 * @since 0.1.0
 */
export const layer = Layer.mergeAll(
  OnePasswordCompat.Default,
  PassSession.Default,
  Paths.Default,
  Telemetry.Default
).pipe(Layer.provideMerge(NodeContext.layer), Layer.merge(StderrLoggerLive))
