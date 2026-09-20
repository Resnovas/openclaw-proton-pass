/*
 * Project: openclaw-proton-pass
 * File: service.spec.ts
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

import { afterEach, describe, expect, it } from "@effect/vitest"
import { NodeContext } from "@effect/platform-node"
import { Paths } from "@resnovas/opp-config"
import {
  ConnectForbidden,
  ConnectUnauthorized,
  OnePasswordCompat
} from "@resnovas/opp-onepassword-compat"
import { PassSession } from "@resnovas/opp-pass-cli"
import { Telemetry } from "@resnovas/opp-telemetry"
import { Effect, Exit, Layer, Redacted } from "effect"
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const vaultJson = JSON.stringify({
  vaults: [{ name: "Private", vault_id: "vault-1", share_id: "share-1" }]
})

const itemsJson = JSON.stringify({
  items: [
    {
      id: "item-1",
      share_id: "share-1",
      vault_id: "vault-1",
      title: "GitHub",
      item_type: "login",
      state: "Active"
    }
  ]
})

const itemViewJson = JSON.stringify({
  item: {
    id: "item-1",
    share_id: "share-1",
    vault_id: "vault-1",
    state: "Active",
    content: {
      title: "GitHub",
      note: "",
      content: {
        username: "user",
        password: "secret-value",
        urls: ["https://github.com"]
      }
    }
  }
})

const infoJson = JSON.stringify({
  id: "user-1",
  email: "agent@example.com",
  username: "agent",
  release_track: "stable"
})

const stubScript = (stateFile: string): string => `#!/usr/bin/env bash
state="${stateFile}"
case "$1" in
  info)
    if [ "$2" = "--output" ]; then
      echo '${infoJson.replaceAll("'", "'\\''")}'
      exit 0
    fi
    exit 0
    ;;
  logout) exit 0 ;;
  login)
    attempts=$(( $(cat "$state" 2>/dev/null || echo 0) + 1 ))
    echo "$attempts" > "$state"
    exit 0
    ;;
  vault)
    if [ "$2" = "list" ] && [ "$4" = "json" ]; then
      echo '${vaultJson.replaceAll("'", "'\\''")}'
      exit 0
    fi
    exit 1
    ;;
  item)
    if [ "$2" = "list" ] && [ "$6" = "json" ]; then
      echo '${itemsJson.replaceAll("'", "'\\''")}'
      exit 0
    fi
    if [ "$2" = "view" ] && [ "$8" = "json" ]; then
      echo '${itemViewJson.replaceAll("'", "'\\''")}'
      exit 0
    fi
    if [ "$2" = "view" ] && [ "$3" = "pass://Private/GitHub/password" ]; then
      echo "secret-value"
      exit 0
    fi
    exit 1
    ;;
  *) exit 1 ;;
esac
`

let workspaceDir: string | undefined

afterEach(() => {
  if (workspaceDir !== undefined) {
    rmSync(workspaceDir, { recursive: true, force: true })
    workspaceDir = undefined
  }
})

const startWorkspace = (agentToken = "connect-token") => {
  delete process.env["OPENCLAW_PROTONPASS_AGENT_TOKEN"]
  workspaceDir = mkdtempSync(join(tmpdir(), "opp-compat-"))
  const configDir = join(workspaceDir, "config")
  mkdirSync(configDir, { recursive: true })
  writeFileSync(join(configDir, "openclaw-agent-pat"), `${agentToken}\n`)
  const passCli = join(workspaceDir, "pass-cli")
  writeFileSync(passCli, stubScript(join(workspaceDir, "login-attempts")), "utf8")
  chmodSync(passCli, 0o755)

  process.env["OPENCLAW_PROTONPASS_CONFIG_DIR"] = configDir
  process.env["OPENCLAW_PROTONPASS_AGENT_PAT"] = join(configDir, "openclaw-agent-pat")
  process.env["OPENCLAW_PROTONPASS_SESSION_DIR"] = join(workspaceDir, "session")
  process.env["PASS_CLI"] = passCli
}

const layer = Layer.provideMerge(
  OnePasswordCompat.Default,
  Layer.provideMerge(
    PassSession.Default,
    Layer.provideMerge(Layer.mergeAll(Paths.Default, Telemetry.Default), NodeContext.layer)
  )
)

const run = <A, E>(body: (compat: OnePasswordCompat) => Effect.Effect<A, E>) => {
  startWorkspace()
  return Effect.gen(function* () {
    const compat = yield* OnePasswordCompat
    return yield* body(compat)
  }).pipe(Effect.provide(layer), Effect.exit)
}

describe("OnePasswordCompat", () => {
  it.effect("validateToken accepts the configured agent token", () =>
    Effect.gen(function* () {
      const result = yield* run((compat) =>
        compat.validateToken(Redacted.make("connect-token"))
      )
      expect(Exit.isSuccess(result)).toBe(true)
    })
  )

  it.effect("validateToken rejects a mismatched token", () =>
    Effect.gen(function* () {
      const result = yield* run((compat) => compat.validateToken(Redacted.make("wrong")))
      expect(Exit.isFailure(result)).toBe(true)
      if (Exit.isFailure(result)) {
        expect(result.cause._tag).toBe("Fail")
      }
    })
  )

  it.effect("lists vaults from pass-cli JSON", () =>
    Effect.gen(function* () {
      const result = yield* run((compat) => compat.listVaults())
      expect(Exit.isSuccess(result)).toBe(true)
      if (Exit.isSuccess(result)) {
        expect(result.value).toEqual([{ id: "share-1", name: "Private" }])
      }
    })
  )

  it.effect("gets one vault by share id or name", () =>
    Effect.gen(function* () {
      const byId = yield* run((compat) => compat.getVault("share-1"))
      const byName = yield* run((compat) => compat.getVault("Private"))
      expect(Exit.isSuccess(byId)).toBe(true)
      expect(Exit.isSuccess(byName)).toBe(true)
    })
  )

  it.effect("lists and loads items for a vault", () =>
    Effect.gen(function* () {
      const listed = yield* run((compat) => compat.listItems("share-1"))
      expect(Exit.isSuccess(listed)).toBe(true)
      if (Exit.isSuccess(listed)) {
        expect(listed.value[0]?.title).toBe("GitHub")
      }

      const loaded = yield* run((compat) => compat.getItem("share-1", "item-1"))
      expect(Exit.isSuccess(loaded)).toBe(true)
      if (Exit.isSuccess(loaded)) {
        expect(loaded.value.category).toBe("LOGIN")
      }
    })
  )

  it.effect("reads secrets as Redacted values", () =>
    Effect.gen(function* () {
      const result = yield* run((compat) =>
        compat.readSecretUri("op://Private/GitHub/password")
      )
      expect(Exit.isSuccess(result)).toBe(true)
      if (Exit.isSuccess(result)) {
        expect(Redacted.value(result.value)).toBe("secret-value")
      }
    })
  )

  it.effect("returns whoami details from pass-cli info", () =>
    Effect.gen(function* () {
      const result = yield* run((compat) => compat.whoami())
      expect(Exit.isSuccess(result)).toBe(true)
      if (Exit.isSuccess(result)) {
        expect(result.value.accountUuid).toBe("user-1")
        expect(result.value.email).toBe("agent@example.com")
      }
    })
  )

  it.effect("assertVaultAccess validates token and vault scope", () =>
    Effect.gen(function* () {
      const allowed = yield* run((compat) =>
        compat.assertVaultAccess(Redacted.make("connect-token"), "share-1")
      )
      expect(Exit.isSuccess(allowed)).toBe(true)

      const forbidden = yield* run((compat) =>
        compat.assertVaultAccess(Redacted.make("connect-token"), "missing")
      )
      expect(Exit.isFailure(forbidden)).toBe(true)

      const unauthorized = yield* run((compat) =>
        compat.assertVaultAccess(Redacted.make("wrong"), "share-1")
      )
      expect(Exit.isFailure(unauthorized)).toBe(true)
    })
  )
})

describe("Connect error tags from service boundaries", () => {
  it("uses ConnectUnauthorized and ConnectForbidden tags", () => {
    expect(new ConnectUnauthorized({ message: "Invalid or missing token" })._tag).toBe(
      "ConnectUnauthorized"
    )
    expect(new ConnectForbidden({ message: "Vault not in scope" })._tag).toBe("ConnectForbidden")
  })
})
