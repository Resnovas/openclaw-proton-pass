/*
 * Project: openclaw-proton-pass
 * File: server.spec.ts
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
import { OnePasswordCompat } from "@resnovas/opp-onepassword-compat"
import { PassSession } from "@resnovas/opp-pass-cli"
import { Telemetry } from "@resnovas/opp-telemetry"
import { Effect, Exit, Fiber, Layer } from "effect"
import { createServer, request as httpRequest, type IncomingHttpHeaders } from "node:http"
import {
  handleRoute,
  matchConnectRoute,
  requestPath,
  serve
} from "../../../../apps/connect/src/server.js"
import type { ConnectRoute } from "../../../../apps/connect/src/server.js"
import { freePort, waitForPort } from "../../../helpers/upstream.js"
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { IncomingMessage, ServerResponse } from "node:http"
import { EventEmitter } from "node:events"

let workspaceDir: string | undefined
let stop: (() => Promise<unknown>) | undefined

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

interface StubOptions {
  readonly inactiveHealth?: boolean
  readonly failVaultList?: boolean
  readonly failSession?: boolean
}

const stubScript = (stateFile: string, options: StubOptions = {}): string => {
  const infoBody = options.inactiveHealth
    ? "exit 1"
    : `echo '${infoJson.replaceAll("'", "'\\''")}'\n      exit 0`
  const vaultBody = options.failVaultList
    ? "exit 1"
    : `echo '${vaultJson.replaceAll("'", "'\\''")}'\n      exit 0`
  return `#!/usr/bin/env bash
state="${stateFile}"
case "$1" in
  info)
    if [ "$2" = "--output" ]; then
      ${infoBody}
    fi
    ${options.failSession ? "exit 1" : "exit 0"}
    ;;
  logout) exit 0 ;;
  login)
    ${options.failSession ? "exit 1" : `attempts=$(( $(cat "$state" 2>/dev/null || echo 0) + 1 ))
    echo "$attempts" > "$state"
    exit 0`}
    ;;
  vault)
    if [ "$2" = "list" ] && [ "$4" = "json" ]; then
      ${vaultBody}
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
    exit 1
    ;;
  *) exit 1 ;;
esac
`
}

const startWorkspace = (agentToken = "connect-token", options: StubOptions = {}) => {
  delete process.env["OPENCLAW_PROTONPASS_AGENT_TOKEN"]
  workspaceDir = mkdtempSync(join(tmpdir(), "opp-connect-"))
  const configDir = join(workspaceDir, "config")
  mkdirSync(configDir, { recursive: true })
  writeFileSync(join(configDir, "openclaw-agent-pat"), `${agentToken}\n`)
  const passCli = join(workspaceDir, "pass-cli")
  writeFileSync(passCli, stubScript(join(workspaceDir, "login-attempts"), options), "utf8")
  chmodSync(passCli, 0o755)

  process.env["OPENCLAW_PROTONPASS_CONFIG_DIR"] = configDir
  process.env["OPENCLAW_PROTONPASS_AGENT_PAT"] = join(configDir, "openclaw-agent-pat")
  process.env["OPENCLAW_PROTONPASS_SESSION_DIR"] = join(workspaceDir, "session")
  process.env["PASS_CLI"] = passCli
}

afterEach(async () => {
  if (stop !== undefined) await stop()
  stop = undefined
  if (workspaceDir !== undefined) {
    rmSync(workspaceDir, { recursive: true, force: true })
    workspaceDir = undefined
  }
  delete process.env["OP_CONNECT_LISTEN"]
})

const layer = Layer.provideMerge(
  OnePasswordCompat.Default,
  Layer.provideMerge(
    PassSession.Default,
    Layer.provideMerge(Layer.mergeAll(Paths.Default, Telemetry.Default), NodeContext.layer)
  )
)

interface HttpResponse {
  readonly status: number
  readonly body: string
  readonly headers: IncomingHttpHeaders
}

const connectRequest = (
  port: number,
  path: string,
  options: { method?: string; headers?: Record<string, string> } = {}
): Promise<HttpResponse> =>
  new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        hostname: "127.0.0.1",
        port,
        path,
        method: options.method ?? "GET",
        headers: options.headers
      },
      (response) => {
        const chunks: Array<Buffer> = []
        response.on("data", (chunk: Buffer) => chunks.push(chunk))
        response.on("end", () =>
          resolve({
            status: response.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
            headers: response.headers
          })
        )
      }
    )
    req.on("error", reject)
    req.end()
  })

const startConnect = async (port: number) => {
  process.env["OP_CONNECT_LISTEN"] = `127.0.0.1:${port}`
  const fiber = Effect.runFork(
    Effect.scoped(serve.pipe(Effect.zipRight(Effect.never))).pipe(Effect.provide(layer))
  )
  stop = () => Effect.runPromise(Fiber.interrupt(fiber))
  await waitForPort(port)
  return fiber
}

describe("matchConnectRoute", () => {
  it("recognises public and vault routes", () => {
    expect(matchConnectRoute("GET", "/heartbeat")).toEqual({ _tag: "heartbeat" })
    expect(matchConnectRoute("GET", "/health")).toEqual({ _tag: "health" })
    expect(matchConnectRoute("GET", "/v1/activity")).toEqual({ _tag: "activity" })
    expect(matchConnectRoute("GET", "/v1/vaults")).toEqual({ _tag: "listVaults" })
    expect(matchConnectRoute("GET", "/v1/vaults/share-1")).toEqual({
      _tag: "getVault",
      vaultId: "share-1"
    })
    expect(matchConnectRoute("GET", "/v1/vaults/share-1/items")).toEqual({
      _tag: "listItems",
      vaultId: "share-1"
    })
    expect(matchConnectRoute("POST", "/v1/vaults/share-1/items")).toEqual({
      _tag: "createItem",
      vaultId: "share-1"
    })
    expect(matchConnectRoute("PUT", "/v1/vaults/share-1/items/item-1")).toEqual({
      _tag: "replaceItem",
      vaultId: "share-1",
      itemId: "item-1"
    })
    expect(matchConnectRoute("PATCH", "/v1/vaults/share-1/items/item-1")).toEqual({
      _tag: "patchItem",
      vaultId: "share-1",
      itemId: "item-1"
    })
    expect(matchConnectRoute("GET", "/v1/vaults/share-1/items/item-1/files")).toEqual({
      _tag: "fileRoute",
      vaultId: "share-1",
      itemId: "item-1",
      operation: "GET /v1/vaults/share-1/items/item-1/files"
    })
    expect(matchConnectRoute("GET", "/unknown")).toEqual({ _tag: "notFound" })
    expect(matchConnectRoute("OPTIONS", "/v1/vaults/share-1/items/item-1")).toEqual({
      _tag: "notFound"
    })
    expect(matchConnectRoute("GET", "/v1/vaults/share-1/extra")).toEqual({ _tag: "notFound" })
    expect(matchConnectRoute("POST", "/v1/vaults/share-1")).toEqual({ _tag: "notFound" })
    expect(matchConnectRoute("DELETE", "/v1/vaults/share-1/items")).toEqual({ _tag: "notFound" })
    expect(matchConnectRoute("GET", "/v1/vaults/share-1/items/item-1/extra")).toEqual({
      _tag: "notFound"
    })
  })
})

describe("requestPath", () => {
  it("strips the query string", () => {
    const request = { url: "/v1/vaults?filter=1" } as IncomingMessage
    expect(requestPath(request)).toBe("/v1/vaults")
  })

  it("defaults to root when url is missing", () => {
    const request = new EventEmitter() as IncomingMessage
    expect(requestPath(request)).toBe("/")
  })
})

describe("serve", () => {
  it("returns heartbeat without authentication", async () => {
    const port = freePort()
    startWorkspace()
    await startConnect(port)

    const response = await connectRequest(port, "/heartbeat")
    expect(response.status).toBe(200)
    expect(response.body).toBe(".")
    expect(response.headers["content-type"]).toContain("text/plain")
  })

  it("returns 401 for /v1 routes without a bearer token", async () => {
    const port = freePort()
    startWorkspace()
    await startConnect(port)

    const response = await connectRequest(port, "/v1/vaults")
    expect(response.status).toBe(401)
    expect(JSON.parse(response.body)).toEqual({
      status: 401,
      message: "Invalid or missing token"
    })
  })

  it("lists vaults with a valid bearer token", async () => {
    const port = freePort()
    startWorkspace()
    await startConnect(port)

    const response = await connectRequest(port, "/v1/vaults", {
      headers: { authorization: "Bearer connect-token" }
    })
    expect(response.status).toBe(200)
    expect(JSON.parse(response.body)).toEqual([{ id: "share-1", name: "Private" }])
  })

  it("reports health with Proton session status", async () => {
    const port = freePort()
    startWorkspace()
    await startConnect(port)

    const response = await connectRequest(port, "/health")
    expect(response.status).toBe(200)
    const body = JSON.parse(response.body) as {
      protonPass: { session: string; accountUuid?: string }
    }
    expect(body.protonPass.session).toBe("active")
    expect(body.protonPass.accountUuid).toBe("user-1")
  })

  it("returns unsupported for activity and file routes", async () => {
    const port = freePort()
    startWorkspace()
    await startConnect(port)
    const auth = { authorization: "Bearer connect-token" }

    const activity = await connectRequest(port, "/v1/activity", { headers: auth })
    expect(activity.status).toBe(400)
    expect(activity.body).toContain("Unsupported by Proton Pass:")

    const files = await connectRequest(port, "/v1/vaults/share-1/items/item-1/files", {
      headers: auth
    })
    expect(files.status).toBe(400)
    expect(files.body).toContain("document file attachments")
  })

  it("loads one vault and item with authentication", async () => {
    const port = freePort()
    startWorkspace()
    await startConnect(port)
    const auth = { authorization: "Bearer connect-token" }

    const vault = await connectRequest(port, "/v1/vaults/share-1", { headers: auth })
    expect(JSON.parse(vault.body)).toEqual({ id: "share-1", name: "Private" })

    const items = await connectRequest(port, "/v1/vaults/share-1/items", { headers: auth })
    expect(JSON.parse(items.body)[0]?.title).toBe("GitHub")

    const item = await connectRequest(port, "/v1/vaults/share-1/items/item-1", { headers: auth })
    expect(JSON.parse(item.body).category).toBe("LOGIN")
  })

  it("rejects write operations with Connect unsupported errors", async () => {
    const port = freePort()
    startWorkspace()
    await startConnect(port)
    const auth = { authorization: "Bearer connect-token" }

    const created = await connectRequest(port, "/v1/vaults/share-1/items", {
      method: "POST",
      headers: auth
    })
    expect(created.status).toBe(400)
    expect(created.body).toContain("POST item")

    const replaced = await connectRequest(port, "/v1/vaults/share-1/items/item-1", {
      method: "PUT",
      headers: auth
    })
    expect(replaced.status).toBe(400)
    expect(replaced.body).toContain("PUT item")

    const patched = await connectRequest(port, "/v1/vaults/share-1/items/item-1", {
      method: "PATCH",
      headers: auth
    })
    expect(patched.status).toBe(400)
    expect(patched.body).toContain("PATCH item")

    const deleted = await connectRequest(port, "/v1/vaults/share-1/items/item-1", {
      method: "DELETE",
      headers: auth
    })
    expect(deleted.status).toBe(400)
  })

  it("reports inactive health when pass-cli info fails", async () => {
    const port = freePort()
    startWorkspace("connect-token", { inactiveHealth: true })
    await startConnect(port)

    const response = await connectRequest(port, "/health")
    expect(JSON.parse(response.body).protonPass.session).toBe("inactive")
  })

  it("returns 500 when the Proton Pass session cannot be established", async () => {
    const port = freePort()
    startWorkspace("connect-token", { failSession: true })
    await startConnect(port)

    const response = await connectRequest(port, "/v1/vaults", {
      headers: { authorization: "Bearer connect-token" }
    })
    expect(response.status).toBe(500)
    expect(JSON.parse(response.body).message).toBe("internal server error")
  })

  it("returns 404 for unknown routes", async () => {
    const port = freePort()
    startWorkspace()
    await startConnect(port)

    const response = await connectRequest(port, "/v1/nowhere", {
      headers: { authorization: "Bearer connect-token" }
    })
    expect(response.status).toBe(404)
  })
})

describe("handleRoute", () => {
  it("covers the defensive default branch", async () => {
    startWorkspace()
    const compat = await Effect.runPromise(OnePasswordCompat.pipe(Effect.provide(layer)))
    const response = new EventEmitter() as unknown as ServerResponse
    response.writeHead = () => response
    response.end = () => response

    const impossible = { _tag: "impossible" } as ConnectRoute
    const result = await Effect.runPromise(
      handleRoute(compat, impossible, response).pipe(Effect.exit)
    )
    expect(Exit.isSuccess(result)).toBe(true)
  })
})

describe("serve listener failures", () => {
  it("fails when the port is already in use", async () => {
    const blocker = createServer()
    const port = freePort()
    await new Promise<void>((resolve) => blocker.listen(port, "127.0.0.1", resolve))
    try {
      startWorkspace()
      process.env["OP_CONNECT_LISTEN"] = `127.0.0.1:${port}`
      const result = await Effect.runPromise(
        Effect.scoped(serve).pipe(Effect.provide(layer), Effect.exit)
      )
      expect(Exit.isFailure(result)).toBe(true)
      expect(JSON.stringify(result)).toContain("ConnectIoError")
    } finally {
      await new Promise<void>((resolve) => blocker.close(() => resolve()))
    }
  })
})
