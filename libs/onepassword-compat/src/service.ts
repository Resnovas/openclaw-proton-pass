/*
 * Project: openclaw-proton-pass
 * File: service.ts
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
 * Map Proton Pass vault operations onto 1Password Connect contract types.
 *
 * Uses {@link PassSession} for authentication and pass-cli for I/O. Secrets
 * stay {@link Redacted} until a caller explicitly unwraps them at a boundary.
 *
 * @module
 * @since 0.1.0
 */

import { FileSystem } from "@effect/platform"
import { agentTokenFromEnvironment, Paths } from "@resnovas/opp-config"
import type { OpSecretRef, Vault } from "@resnovas/opp-onepassword-contract"
import { parseOpSecretRef } from "@resnovas/opp-onepassword-contract"
import { PassSession } from "@resnovas/opp-pass-cli"
import { Effect, Option, Redacted } from "effect"
import {
  AuthError,
  ConnectForbidden,
  ConnectNotFound,
  ConnectUnauthorized,
  ItemError,
  VaultError
} from "./errors.js"
import { protonItemToFullItem, protonItemToItem } from "./mapping.js"
import { opSecretRefToPassRef } from "./pass-ref.js"
import {
  itemList,
  itemView,
  itemViewField,
  sessionInfo,
  vaultList
} from "./pass-command.js"

/**
 * Account details returned by {@link OnePasswordCompat.whoami}.
 *
 * @category models
 * @since 0.1.0
 */
export interface WhoamiResult {
  readonly accountUuid: string
  readonly email?: string
  readonly name?: string
  readonly personalAccessTokenName?: string
}

const AGENT_AUDIT_REASON = "1Password compatibility layer reading Proton Pass vault data"

const readConfiguredToken = Effect.gen(function* () {
  const paths = yield* Paths
  const fs = yield* FileSystem.FileSystem
  const supplied = yield* agentTokenFromEnvironment
  if (Option.isSome(supplied)) return supplied.value

  const exists = yield* fs.exists(paths.agentPat).pipe(Effect.orElseSucceed(() => false))
  if (!exists) {
    return yield* new AuthError({ reason: "Invalid or missing token" })
  }

  const contents = yield* fs.readFileString(paths.agentPat).pipe(
    Effect.mapError(() => new AuthError({ reason: "Invalid or missing token" }))
  )
  return Redacted.make(contents.trim())
})

const tokensMatch = (
  supplied: Redacted.Redacted<string>,
  expected: Redacted.Redacted<string>
): boolean => Redacted.value(supplied) === Redacted.value(expected)

const commandEnv = (baseEnv: Readonly<Record<string, string>>): Record<string, string> => ({
  ...baseEnv,
  PROTON_PASS_AGENT_REASON: AGENT_AUDIT_REASON
})

const findVault = (
  vaults: ReadonlyArray<{ readonly shareId: string; readonly vaultId: string; readonly name: string }>,
  vaultId: string
) => vaults.find((vault) => vault.shareId === vaultId || vault.vaultId === vaultId || vault.name === vaultId)

/**
 * Compatibility core shared by the alias CLI and Connect HTTP server.
 *
 * @category services
 * @since 0.1.0
 */
export class OnePasswordCompat extends Effect.Service<OnePasswordCompat>()("OnePasswordCompat", {
  effect: Effect.gen(function* () {
    const session = yield* PassSession

    const validateToken = (token: Redacted.Redacted<string>) =>
      Effect.gen(function* () {
        const expected = yield* readConfiguredToken.pipe(
          Effect.mapError(() => new ConnectUnauthorized({ message: "Invalid or missing token" }))
        )
        if (!tokensMatch(token, expected)) {
          return yield* new ConnectUnauthorized({ message: "Invalid or missing token" })
        }
      })

    const withSession = <A, E, R>(operation: Effect.Effect<A, E, R>) =>
      Effect.gen(function* () {
        yield* session.ensure
        return yield* operation
      })

    const listVaults = () =>
      withSession(
        vaultList(commandEnv(session.baseEnv)).pipe(
          Effect.map((vaults) =>
            vaults.map(
              (vault): Vault => ({
                id: vault.shareId,
                name: vault.name
              })
            )
          ),
          Effect.mapError(
            (cause) =>
              new VaultError({
                reason: cause.stderr
              })
          )
        )
      )

    const getVault = (vaultId: string) =>
      withSession(
        Effect.gen(function* () {
          const vaults = yield* vaultList(commandEnv(session.baseEnv))
          const match = findVault(vaults, vaultId)
          if (match === undefined) {
            return yield* new ConnectNotFound({
              message: `Vault not found: ${vaultId}`,
              resource: "vault",
              id: vaultId
            })
          }
          return { id: match.shareId, name: match.name } satisfies Vault
        }).pipe(
          Effect.mapError((cause) => {
            if (cause._tag === "ConnectNotFound") return cause
            return new VaultError({
              reason: cause._tag === "CliExit" ? cause.stderr : String(cause),
              vaultId
            })
          })
        )
      )

    const listItems = (vaultId: string) =>
      withSession(
        Effect.gen(function* () {
          const vaults = yield* vaultList(commandEnv(session.baseEnv))
          const vault = findVault(vaults, vaultId)
          if (vault === undefined) {
            return yield* new ConnectNotFound({
              message: `Vault not found: ${vaultId}`,
              resource: "vault",
              id: vaultId
            })
          }
          const items = yield* itemList(vault.shareId, commandEnv(session.baseEnv))
          return items.map((item) => protonItemToItem(item, vault.shareId))
        }).pipe(
          Effect.mapError((cause) => {
            if (cause._tag === "ConnectNotFound") return cause
            return new ItemError({
              reason: cause._tag === "CliExit" ? cause.stderr : String(cause)
            })
          })
        )
      )

    const getItem = (vaultId: string, itemId: string) =>
      withSession(
        Effect.gen(function* () {
          const vaults = yield* vaultList(commandEnv(session.baseEnv))
          const vault = findVault(vaults, vaultId)
          if (vault === undefined) {
            return yield* new ConnectNotFound({
              message: `Vault not found: ${vaultId}`,
              resource: "vault",
              id: vaultId
            })
          }

          const listed = yield* itemList(vault.shareId, commandEnv(session.baseEnv))
          const summary = listed.find((item) => item.id === itemId || item.title === itemId)
          if (summary === undefined) {
            return yield* new ConnectNotFound({
              message: `Item not found: ${itemId}`,
              resource: "item",
              id: itemId
            })
          }

          const item = yield* itemView(vault.shareId, summary.id, commandEnv(session.baseEnv))
          return protonItemToFullItem(item, vault.shareId)
        }).pipe(
          Effect.mapError((cause) => {
            if (cause._tag === "ConnectNotFound") return cause
            return new ItemError({
              reason: cause._tag === "CliExit" ? cause.stderr : String(cause),
              itemId
            })
          })
        )
      )

    const readSecret = (ref: OpSecretRef) =>
      withSession(
        itemViewField(opSecretRefToPassRef(ref), commandEnv(session.baseEnv)).pipe(
          Effect.map((value) => Redacted.make(value)),
          Effect.mapError(
            (cause) =>
              new ItemError({
                reason: cause.stderr,
                field: ref.field
              })
          )
        )
      )

    const readSecretUri = (uri: string) =>
      parseOpSecretRef(uri).pipe(Effect.flatMap((ref) => readSecret(ref)))

    const whoami = () =>
      withSession(
        sessionInfo(commandEnv(session.baseEnv)).pipe(
          Effect.map(
            (info): WhoamiResult => ({
              accountUuid: info.id,
              ...(info.email === undefined ? {} : { email: info.email }),
              ...(info.username === undefined ? {} : { name: info.username }),
              ...(info.personal_access_token_name === undefined
                ? {}
                : { personalAccessTokenName: info.personal_access_token_name })
            })
          ),
          Effect.mapError(
            (cause) =>
              new ItemError({
                reason: cause.stderr
              })
          )
        )
      )

    const assertVaultAccess = (token: Redacted.Redacted<string>, vaultId: string) =>
      Effect.gen(function* () {
        yield* validateToken(token)
        const vaults = yield* listVaults()
        const match = vaults.find((vault) => vault.id === vaultId || vault.name === vaultId)
        if (match === undefined) {
          return yield* new ConnectForbidden({
            message: "Vault not in scope",
            vaultId
          })
        }
      })

    return {
      validateToken,
      listVaults,
      getVault,
      listItems,
      getItem,
      readSecret,
      readSecretUri,
      whoami,
      assertVaultAccess
    } as const
  }),
  dependencies: [PassSession.Default]
}) {}
