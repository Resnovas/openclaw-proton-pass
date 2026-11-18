/*
 * Project: openclaw-proton-pass
 * File: pass-command.spec.ts
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
  itemList,
  itemView,
  itemViewField,
  runPassJson,
  runPassText,
  sessionInfo,
  vaultList,
  PassVaultListJson
} from "@resnovas/opp-onepassword-compat"
import { Effect, Exit, Layer } from "effect"
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

let workspaceDir: string | undefined
let inheritedTimeout: string | undefined

afterEach(() => {
  if (workspaceDir !== undefined) {
    rmSync(workspaceDir, { recursive: true, force: true })
    workspaceDir = undefined
  }
  if (inheritedTimeout === undefined) delete process.env["OPENCLAW_PROTONPASS_TIMEOUT_MS"]
  else process.env["OPENCLAW_PROTONPASS_TIMEOUT_MS"] = inheritedTimeout
})

const layer = Layer.provideMerge(Paths.Default, NodeContext.layer)

const startWorkspace = (script: string, timeoutMs?: string) => {
  inheritedTimeout = process.env["OPENCLAW_PROTONPASS_TIMEOUT_MS"]
  workspaceDir = mkdtempSync(join(tmpdir(), "opp-pass-command-"))
  const configDir = join(workspaceDir, "config")
  mkdirSync(configDir, { recursive: true })
  const passCli = join(workspaceDir, "pass-cli")
  writeFileSync(passCli, script, "utf8")
  chmodSync(passCli, 0o755)
  process.env["OPENCLAW_PROTONPASS_CONFIG_DIR"] = configDir
  process.env["OPENCLAW_PROTONPASS_SESSION_DIR"] = join(workspaceDir, "session")
  process.env["PASS_CLI"] = passCli
  if (timeoutMs === undefined) delete process.env["OPENCLAW_PROTONPASS_TIMEOUT_MS"]
  else process.env["OPENCLAW_PROTONPASS_TIMEOUT_MS"] = timeoutMs
}

const env = { PROTON_PASS_SESSION_DIR: "/tmp/session" }

const run = <A, E>(effect: Effect.Effect<A, E>) =>
  Effect.runPromise(effect.pipe(Effect.provide(layer), Effect.exit))

describe("pass-command helpers", () => {
  it("lists vaults from valid JSON", async () => {
    startWorkspace(`#!/usr/bin/env bash
if [ "$1" = "vault" ] && [ "$4" = "json" ]; then
  echo '{"vaults":[{"name":"Private","vault_id":"v1","share_id":"s1"}]}'
  exit 0
fi
exit 1
`)
    const result = await run(vaultList(env))
    expect(Exit.isSuccess(result)).toBe(true)
    if (Exit.isSuccess(result)) {
      expect(result.value[0]?.name).toBe("Private")
    }
  })

  it("lists items and views one item", async () => {
    startWorkspace(`#!/usr/bin/env bash
if [ "$1" = "item" ] && [ "$2" = "list" ]; then
  echo '{"items":[{"id":"i1","share_id":"s1","vault_id":"v1","title":"GitHub","item_type":"login"}]}'
  exit 0
fi
if [ "$1" = "item" ] && [ "$2" = "view" ] && [ "$8" = "json" ]; then
  echo '{"item":{"id":"i1","share_id":"s1","vault_id":"v1","content":{"title":"GitHub","note":"","content":{"username":"u","password":"p"}}}}'
  exit 0
fi
exit 1
`)
    const listed = await run(itemList("s1", env))
    const viewed = await run(itemView("s1", "i1", env))
    expect(Exit.isSuccess(listed)).toBe(true)
    expect(Exit.isSuccess(viewed)).toBe(true)
  })

  it("reads a field value as text", async () => {
    startWorkspace(`#!/usr/bin/env bash
if [ "$1" = "item" ] && [ "$2" = "view" ] && [ "$3" = "pass://Private/GitHub/password" ]; then
  echo "secret-value"
  exit 0
fi
exit 1
`)
    const result = await run(itemViewField("pass://Private/GitHub/password", env))
    expect(Exit.isSuccess(result)).toBe(true)
    if (Exit.isSuccess(result)) expect(result.value).toBe("secret-value")
  })

  it("reads session info JSON", async () => {
    startWorkspace(`#!/usr/bin/env bash
if [ "$1" = "info" ] && [ "$3" = "json" ]; then
  echo '{"id":"user-1","email":"agent@example.com"}'
  exit 0
fi
exit 1
`)
    const result = await run(sessionInfo(env))
    expect(Exit.isSuccess(result)).toBe(true)
    if (Exit.isSuccess(result)) expect(result.value.id).toBe("user-1")
  })

  it("maps non-zero exits to CliExit", async () => {
    startWorkspace(`#!/usr/bin/env bash
echo "failure" 1>&2
exit 2
`)
    const result = await run(runPassText(["item", "view", "pass://x"], env))
    expect(Exit.isFailure(result)).toBe(true)
    if (Exit.isFailure(result)) {
      expect(JSON.stringify(result.cause)).toContain("CliExit")
    }
  })

  it("maps invalid JSON to CliExit", async () => {
    startWorkspace(`#!/usr/bin/env bash
echo "not json"
exit 0
`)
    const result = await run(
      runPassJson(["vault", "list", "--output", "json"], PassVaultListJson, env)
    )
    expect(Exit.isFailure(result)).toBe(true)
    if (Exit.isFailure(result)) {
      expect(JSON.stringify(result.cause)).toContain("invalid JSON")
    }
  })

  it("maps schema mismatches to CliExit", async () => {
    startWorkspace(`#!/usr/bin/env bash
echo '{"unexpected":[]}'
exit 0
`)
    const result = await run(
      runPassJson(["vault", "list", "--output", "json"], PassVaultListJson, env)
    )
    expect(Exit.isFailure(result)).toBe(true)
    if (Exit.isFailure(result)) {
      expect(JSON.stringify(result.cause)).toContain("did not match schema")
    }
  })

  it("maps invalid timeout configuration to CliExit", async () => {
    startWorkspace(`#!/usr/bin/env bash
exit 0
`, "not-a-number")
    const result = await run(
      runPassJson(["vault", "list", "--output", "json"], PassVaultListJson, env)
    )
    expect(Exit.isFailure(result)).toBe(true)
    if (Exit.isFailure(result)) {
      expect(JSON.stringify(result.cause)).toContain("command timeout config")
    }
  })

  it("maps invalid timeout configuration for text commands to CliExit", async () => {
    startWorkspace(`#!/usr/bin/env bash
exit 0
`, "not-a-number")
    const result = await run(runPassText(["info"], env))
    expect(Exit.isFailure(result)).toBe(true)
    if (Exit.isFailure(result)) {
      expect(JSON.stringify(result.cause)).toContain("command timeout config")
    }
  })

  it("maps command timeouts to CliExit", async () => {
    startWorkspace(`#!/usr/bin/env bash
sleep 2
echo "late"
exit 0
`, "100")
    const result = await run(runPassText(["info"], env))
    expect(Exit.isFailure(result)).toBe(true)
  })
})
