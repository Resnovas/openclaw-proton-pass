/*
 * Project: openclaw-proton-pass
 * File: app.spec.ts
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
import { Effect, Fiber } from "effect"
import { request as httpRequest } from "node:http"
import { layer, main } from "../../../../apps/connect/src/app.js"
import { withExitCode } from "../../../helpers/process.js"
import { freePort, waitForPort } from "../../../helpers/upstream.js"
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

let workspaceDir: string | undefined

const stubScript = (): string => `#!/usr/bin/env bash
case "$1" in
  info)
    if [ "$2" = "--output" ]; then
      echo '{"id":"user-1","email":"agent@example.com"}'
      exit 0
    fi
    exit 0
    ;;
  logout) exit 0 ;;
  login) exit 0 ;;
  vault)
    if [ "$2" = "list" ] && [ "$4" = "json" ]; then
      echo '{"vaults":[{"name":"Private","vault_id":"vault-1","share_id":"share-1"}]}'
      exit 0
    fi
    exit 1
    ;;
  *) exit 1 ;;
esac
`

const startWorkspace = (agentToken = "connect-token") => {
  workspaceDir = mkdtempSync(join(tmpdir(), "opp-connect-app-"))
  const configDir = join(workspaceDir, "config")
  mkdirSync(configDir, { recursive: true })
  writeFileSync(join(configDir, "openclaw-agent-pat"), `${agentToken}\n`)
  const passCli = join(workspaceDir, "pass-cli")
  writeFileSync(passCli, stubScript(), "utf8")
  chmodSync(passCli, 0o755)

  process.env["OPENCLAW_PROTONPASS_CONFIG_DIR"] = configDir
  process.env["OPENCLAW_PROTONPASS_AGENT_PAT"] = join(configDir, "openclaw-agent-pat")
  process.env["OPENCLAW_PROTONPASS_SESSION_DIR"] = join(workspaceDir, "session")
  process.env["PASS_CLI"] = passCli
}

afterEach(() => {
  delete process.env["OP_CONNECT_LISTEN"]
  if (workspaceDir !== undefined) {
    rmSync(workspaceDir, { recursive: true, force: true })
    workspaceDir = undefined
  }
})

describe("connect app", () => {
  it("reports invalid configuration and exits non-zero", async () => {
    process.env["OP_CONNECT_LISTEN"] = "0.0.0.0:8087"
    startWorkspace()
    const { exitCode } = await withExitCode(() =>
      Effect.runPromise(main.pipe(Effect.provide(layer)))
    )
    expect(exitCode).toBe(1)
  })

  it("stays running once it is listening", async () => {
    const port = freePort()
    process.env["OP_CONNECT_LISTEN"] = `127.0.0.1:${port}`
    startWorkspace()
    const fiber = Effect.runFork(main.pipe(Effect.provide(layer)))
    await waitForPort(port)

    const response = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      const req = httpRequest(
        { hostname: "127.0.0.1", port, path: "/heartbeat", method: "GET" },
        (res) => {
          const chunks: Array<Buffer> = []
          res.on("data", (chunk: Buffer) => chunks.push(chunk))
          res.on("end", () =>
            resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") })
          )
        }
      )
      req.on("error", reject)
      req.end()
    })

    expect(response.status).toBe(200)
    expect(response.body).toBe(".")
    await Effect.runPromise(Fiber.interrupt(fiber))
  })
})
