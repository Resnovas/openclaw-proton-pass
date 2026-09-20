/*
 * Project: openclaw-proton-pass
 * File: server.spec.ts
 * Last Modified: 2026-09-18
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
import { Telemetry } from "@resnovas/opp-telemetry"
import { PassSession, SecretResolver } from "@resnovas/opp-pass-cli"
import { Effect, Exit, Fiber, Layer } from "effect"
import { EventEmitter } from "node:events"
import { gzipSync } from "node:zlib"
import type { IncomingMessage } from "node:http"
import { createServer } from "node:http"
import { loadConfig, readBody, serve } from "../../../../apps/mcp-auth-proxy/src/server.js"
import { freePort, startUpstream, waitForPort, type Upstream } from "../../../helpers/upstream.js"
import { makeWorkspace, type Workspace } from "../../../helpers/workspace.js"

let workspace: Workspace | undefined
let upstream: Upstream | undefined
let stop: (() => Promise<unknown>) | undefined

afterEach(async () => {
  if (stop !== undefined) await stop()
  stop = undefined
  if (upstream !== undefined) await upstream.close()
  upstream = undefined
  workspace?.dispose()
  workspace = undefined
})

const layer = Layer.mergeAll(
  SecretResolver.Default,
  PassSession.Default,
  Paths.Default,
  Telemetry.Default
).pipe(
  Layer.provideMerge(NodeContext.layer)
)

const loading = loadConfig.pipe(Effect.provide(layer), Effect.exit)

const startProxy = async (port: number) => {
  const fiber = Effect.runFork(
    Effect.scoped(serve.pipe(Effect.zipRight(Effect.never))).pipe(Effect.provide(layer))
  )
  stop = () => Effect.runPromise(Fiber.interrupt(fiber))
  await waitForPort(port)
  return fiber
}

describe("loadConfig", () => {
  it.effect("reads a valid configuration", () =>
    Effect.gen(function* () {
      workspace = makeWorkspace({
        secretMap: '{"S":"pass://V/i/f"}',
        proxyConfig: '{"listen":"127.0.0.1:18890","routes":{"/a":{"upstream":"https://e.com/m","secretId":"S"}}}'
      })
      const result = yield* loading
      expect(Exit.isSuccess(result)).toBe(true)
    })
  )

  it.effect("fails when the file is absent", () =>
    Effect.gen(function* () {
      workspace = makeWorkspace({ secretMap: "{}" })
      const result = yield* loading
      expect(JSON.stringify(result)).toContain("RouteConfigError")
    })
  )

  it.effect("fails on invalid JSON", () =>
    Effect.gen(function* () {
      workspace = makeWorkspace({ secretMap: "{}", proxyConfig: "{ not json" })
      const result = yield* loading
      expect(JSON.stringify(result)).toContain("invalid JSON")
    })
  )

  it.effect("refuses a non-loopback listen address", () =>
    Effect.gen(function* () {
      // The rule lives in the schema, so this fails at load rather than after
      // the proxy is already serving credentials to anything that reaches it.
      workspace = makeWorkspace({
        secretMap: "{}",
        proxyConfig: '{"listen":"0.0.0.0:18890","routes":{"/a":{"upstream":"https://e.com/m","secretId":"S"}}}'
      })
      const result = yield* loading
      expect(JSON.stringify(result)).toContain("refusing to bind")
    })
  )

  it.effect("refuses an empty route table", () =>
    Effect.gen(function* () {
      workspace = makeWorkspace({ secretMap: "{}", proxyConfig: '{"routes":{}}' })
      const result = yield* loading
      expect(JSON.stringify(result)).toContain("nothing to serve")
    })
  )
})

describe("serve", () => {
  const configure = (port: number, upstreamUrl: string, extra = "") =>
    `{"listen":"127.0.0.1:${port}","routes":{"/example":{"upstream":"${upstreamUrl}","secretId":"S"${extra}}}}`

  it("returns 404 for an unmatched path", async () => {
    upstream = await startUpstream((_request, response) => response.end("never"))
    const port = freePort()
    workspace = makeWorkspace({
      secretMap: '{"S":"pass://V/i/f"}',
      proxyConfig: configure(port, upstream.url),
      stub: { values: ["tok"] }
    })
    await startProxy(port)

    const response = await fetch(`http://127.0.0.1:${port}/nope`)
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: "no route for /nope" })
  })

  it("injects the credential header and rewrites Host", async () => {
    upstream = await startUpstream((_request, response) => {
      response.writeHead(200, { "Content-Type": "text/plain" })
      response.end("upstream ok")
    })
    const port = freePort()
    workspace = makeWorkspace({
      secretMap: '{"S":{"ref":"pass://V/i/f","prefix":"Bearer "}}',
      proxyConfig: configure(port, upstream.url),
      stub: { values: ["tok"] }
    })
    await startProxy(port)

    const response = await fetch(`http://127.0.0.1:${port}/example`)
    expect(response.status).toBe(200)
    expect(await response.text()).toBe("upstream ok")
    expect(upstream.requests[0]?.headers["authorization"]).toBe("Bearer tok")
  })

  it("forwards a POST body", async () => {
    upstream = await startUpstream((request, response) => {
      const chunks: Array<Buffer> = []
      request.on("data", (chunk: Buffer) => chunks.push(chunk))
      request.on("end", () => {
        response.writeHead(200)
        response.end(Buffer.concat(chunks))
      })
    })
    const port = freePort()
    workspace = makeWorkspace({
      secretMap: '{"S":"pass://V/i/f"}',
      proxyConfig: configure(port, upstream.url),
      stub: { values: ["tok"] }
    })
    await startProxy(port)

    const response = await fetch(`http://127.0.0.1:${port}/example`, {
      method: "POST",
      body: JSON.stringify({ hello: "world" })
    })
    expect(await response.json()).toEqual({ hello: "world" })
  })

  it("refreshes the credential once when the upstream answers 401", async () => {
    upstream = await startUpstream((_request, response, index) => {
      if (index === 0) {
        response.writeHead(401)
        response.end("stale")
        return
      }
      response.writeHead(200)
      response.end("accepted")
    })
    const port = freePort()
    workspace = makeWorkspace({
      secretMap: '{"S":"pass://V/i/f"}',
      proxyConfig: configure(port, upstream.url),
      stub: { values: ["tok"] }
    })
    await startProxy(port)

    const response = await fetch(`http://127.0.0.1:${port}/example`)
    expect(response.status).toBe(200)
    expect(await response.text()).toBe("accepted")
    // Exactly one retry, not a loop.
    expect(upstream.requests).toHaveLength(2)
  })

  it("gives up after a refresh the upstream still rejects", async () => {
    upstream = await startUpstream((_request, response) => {
      response.writeHead(401)
      response.end("no")
    })
    const port = freePort()
    workspace = makeWorkspace({
      secretMap: '{"S":"pass://V/i/f"}',
      proxyConfig: configure(port, upstream.url),
      stub: { values: ["tok"] }
    })
    await startProxy(port)

    const response = await fetch(`http://127.0.0.1:${port}/example`)
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({
      error: "upstream rejected the credential after refresh"
    })
  })

  it("answers 502 when the upstream cannot be reached", async () => {
    const port = freePort()
    workspace = makeWorkspace({
      secretMap: '{"S":"pass://V/i/f"}',
      // Port 1 is not listening, so the fetch fails rather than responding.
      proxyConfig: configure(port, "http://127.0.0.1:1/mcp"),
      stub: { values: ["tok"] }
    })
    await startProxy(port)

    const response = await fetch(`http://127.0.0.1:${port}/example`)
    expect(response.status).toBe(502)
    expect(JSON.stringify(await response.json())).toContain("upstream error")
  })

  it("answers 502 when the secret cannot be resolved", async () => {
    upstream = await startUpstream((_request, response) => response.end("ok"))
    const port = freePort()
    workspace = makeWorkspace({
      secretMap: '{"OTHER":"pass://V/i/f"}',
      proxyConfig: configure(port, upstream.url),
      stub: { values: ["tok"] }
    })
    await startProxy(port)

    const response = await fetch(`http://127.0.0.1:${port}/example`)
    expect(response.status).toBe(502)
  })

  it("relays an empty upstream body", async () => {
    upstream = await startUpstream((_request, response) => {
      response.writeHead(204)
      response.end()
    })
    const port = freePort()
    workspace = makeWorkspace({
      secretMap: '{"S":"pass://V/i/f"}',
      proxyConfig: configure(port, upstream.url),
      stub: { values: ["tok"] }
    })
    await startProxy(port)

    const response = await fetch(`http://127.0.0.1:${port}/example`)
    expect(response.status).toBe(204)
  })

  it("surfaces a failure while relaying the upstream body", async () => {
    // The upstream announces a length it never delivers, then drops the
    // socket, so the relay fails midway rather than at connection time.
    upstream = await startUpstream((_request, response) => {
      response.writeHead(200, { "Content-Length": "100" })
      response.write("partial")
      // Destroy after the headers have reached the proxy, so the failure
      // happens while the body is being relayed rather than at connect time.
      setTimeout(() => response.socket?.destroy(), 60)
    })
    const port = freePort()
    workspace = makeWorkspace({
      secretMap: '{"S":"pass://V/i/f"}',
      proxyConfig: configure(port, upstream.url),
      stub: { values: ["tok"] }
    })
    await startProxy(port)

    // The relay failure is reported as an upstream error rather than the
    // client silently receiving a truncated body.
    // The relay fails midway: the client sees a broken response rather than a
    // silently truncated body presented as success.
    await expect(
      fetch(`http://127.0.0.1:${port}/example`).then((response) => response.text())
    ).rejects.toThrow()
  })

  it("relays a non-401 error status from the upstream", async () => {
    // Reported as a failed request, but still relayed: the proxy does not
    // reinterpret an upstream's application errors.
    upstream = await startUpstream((_request, response) => {
      response.writeHead(503)
      response.end("unavailable")
    })
    const port = freePort()
    workspace = makeWorkspace({
      secretMap: '{"S":"pass://V/i/f"}',
      proxyConfig: configure(port, upstream.url),
      stub: { values: ["tok"] }
    })
    await startProxy(port)

    const response = await fetch(`http://127.0.0.1:${port}/example`)
    expect(response.status).toBe(503)
    expect(await response.text()).toBe("unavailable")
  })

  it("relays a non-401 error after a credential refresh", async () => {
    upstream = await startUpstream((_request, response, index) => {
      response.writeHead(index === 0 ? 401 : 500)
      response.end(index === 0 ? "stale" : "upstream broke")
    })
    const port = freePort()
    workspace = makeWorkspace({
      secretMap: '{"S":"pass://V/i/f"}',
      proxyConfig: configure(port, upstream.url),
      stub: { values: ["tok"] }
    })
    await startProxy(port)

    const response = await fetch(`http://127.0.0.1:${port}/example`)
    expect(response.status).toBe(500)
    expect(upstream.requests).toHaveLength(2)
  })

  it("serves a DELETE as well as GET and POST", async () => {
    upstream = await startUpstream((_request, response) => {
      response.writeHead(200)
      response.end("deleted")
    })
    const port = freePort()
    workspace = makeWorkspace({
      secretMap: '{"S":"pass://V/i/f"}',
      proxyConfig: configure(port, upstream.url),
      stub: { values: ["tok"] }
    })
    await startProxy(port)

    const response = await fetch(`http://127.0.0.1:${port}/example`, { method: "DELETE" })
    expect(await response.text()).toBe("deleted")
    expect(upstream.requests[0]?.method).toBe("DELETE")
  })

  it("relays a gzip upstream body without content-encoding", async () => {
    const payload = JSON.stringify({ jsonrpc: "2.0", id: 1, result: { ok: true } })
    upstream = await startUpstream((_request, response) => {
      const compressed = gzipSync(Buffer.from(payload, "utf8"))
      response.writeHead(200, {
        "Content-Type": "application/json",
        "Content-Encoding": "gzip",
        "Content-Length": String(compressed.byteLength)
      })
      response.end(compressed)
    })
    const port = freePort()
    workspace = makeWorkspace({
      secretMap: '{"S":"pass://V/i/f"}',
      proxyConfig: configure(port, upstream.url),
      stub: { values: ["tok"] }
    })
    await startProxy(port)

    const response = await fetch(`http://127.0.0.1:${port}/example`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept-Encoding": "gzip"
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" })
    })
    expect(response.status).toBe(200)
    expect(response.headers.get("content-encoding")).toBeNull()
    expect(await response.json()).toEqual({ jsonrpc: "2.0", id: 1, result: { ok: true } })
  })
})

describe("readBody", () => {
  it("collects a body delivered in chunks", async () => {
    const request = new EventEmitter() as unknown as IncomingMessage
    const promise = Effect.runPromise(readBody(request))
    request.emit("data", Buffer.from("hel"))
    request.emit("data", Buffer.from("lo"))
    request.emit("end")
    expect((await promise).toString("utf8")).toBe("hello")
  })

  it("yields an empty buffer for an empty body", async () => {
    const request = new EventEmitter() as unknown as IncomingMessage
    const promise = Effect.runPromise(readBody(request))
    request.emit("end")
    expect((await promise).byteLength).toBe(0)
  })

  it("fails with ProxyIoError when the socket errors mid-body", async () => {
    const request = new EventEmitter() as unknown as IncomingMessage
    const promise = Effect.runPromise(readBody(request).pipe(Effect.exit))
    request.emit("error", new Error("connection reset"))
    const result = await promise
    expect(JSON.stringify(result)).toContain("ProxyIoError")
  })
})

describe("serve listener failures", () => {
  it("fails when the port is already in use", async () => {
    // The listener error path must surface as a failure rather than a hang.
    const blocker = createServer()
    const port = freePort()
    await new Promise<void>((resolve) => blocker.listen(port, "127.0.0.1", resolve))
    try {
      workspace = makeWorkspace({
        secretMap: '{"S":"pass://V/i/f"}',
        proxyConfig: `{"listen":"127.0.0.1:${port}","routes":{"/a":{"upstream":"http://127.0.0.1:1/m","secretId":"S"}}}`
      })
      const result = await Effect.runPromise(
        Effect.scoped(serve).pipe(Effect.provide(layer), Effect.exit)
      )
      expect(Exit.isFailure(result)).toBe(true)
      expect(JSON.stringify(result)).toContain("ProxyIoError")
    } finally {
      await new Promise<void>((resolve) => blocker.close(() => resolve()))
    }
  })
})
