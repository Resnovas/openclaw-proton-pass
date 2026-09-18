/*
 * Project: openclaw-proton-pass
 * File: server.ts
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

import { FileSystem } from "@effect/platform"
import { Paths } from "@resnovas/opp-config"
import {
  ProxyConfig,
  ProxyIoError,
  RouteConfigError,
  splitAddress,
  type Route,
  type SecretId
} from "@resnovas/opp-domain"
import { SecretResolver } from "@resnovas/opp-pass-cli"
import { Cache, Duration, Effect, Option, Redacted, Runtime, Schema } from "effect"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { matchRoute, outboundHeaders } from "./routing.js"

const decodeConfig = Schema.decodeUnknown(ProxyConfig)

/**
 * Load and validate the route configuration.
 *
 * Validation rejects a non-loopback listen address here, at load, rather than
 * at first request: binding beyond loopback would expose an unauthenticated
 * route that attaches a real credential to anything reaching it.
 *
 * @returns the validated configuration
 */
export const loadConfig = Effect.gen(function* () {
  const paths = yield* Paths
  const fs = yield* FileSystem.FileSystem

  const raw = yield* fs.readFileString(paths.proxyConfig).pipe(
    Effect.mapError(
      (cause) => new RouteConfigError({ path: paths.proxyConfig, reason: String(cause) })
    )
  )
  const json = yield* Effect.try({
    try: () => JSON.parse(raw) as unknown,
    catch: (cause) =>
      new RouteConfigError({ path: paths.proxyConfig, reason: `invalid JSON: ${cause}` })
  })
  const config = yield* decodeConfig(json).pipe(
    Effect.mapError(
      (cause) => new RouteConfigError({ path: paths.proxyConfig, reason: String(cause) })
    )
  )

  if (Object.keys(config.routes).length === 0) {
    return yield* new RouteConfigError({
      path: paths.proxyConfig,
      reason: "no routes configured; nothing to serve"
    })
  }
  return config
})

/** Read a request body fully; MCP payloads are small JSON documents. */
const readBody = (request: IncomingMessage) =>
  Effect.async<Buffer, ProxyIoError>((resume) => {
    const chunks: Array<Buffer> = []
    request.on("data", (chunk: Buffer) => chunks.push(chunk))
    request.on("end", () => resume(Effect.succeed(Buffer.concat(chunks))))
    request.on("error", (cause) =>
      resume(Effect.fail(new ProxyIoError({ reason: String(cause) })))
    )
  })

const respondJson = (response: ServerResponse, status: number, body: unknown) =>
  Effect.sync(() => {
    const encoded = Buffer.from(JSON.stringify(body))
    response.writeHead(status, {
      "Content-Type": "application/json",
      "Content-Length": String(encoded.byteLength),
      Connection: "close"
    })
    response.end(encoded)
  })

/**
 * The running proxy.
 *
 * Credentials are memoised so an MCP call does not cost a vault round trip;
 * because that means a rotated credential would otherwise never be noticed, an
 * upstream 401 invalidates the entry and the request is retried once.
 *
 * The upstream call uses the platform's `fetch` rather than Effect's HttpClient
 * because this hop must forward arbitrary methods and stream an open
 * `text/event-stream` back unchanged; `fetch` exposes the response body as a
 * stream that can be piped through without buffering.
 */
export const serve = Effect.gen(function* () {
  const config = yield* loadConfig
  const resolver = yield* SecretResolver
  const { host, port } = splitAddress(config.listen)

  const cache = yield* Cache.make({
    capacity: 64,
    timeToLive: Duration.minutes(30),
    lookup: (id: SecretId) =>
      resolver.resolve([id]).pipe(
        Effect.flatMap((outcomes) => {
          const outcome = outcomes.get(id)
          return outcome === undefined || outcome._tag === "NotFound"
            ? Effect.fail(new ProxyIoError({ reason: `resolver returned no value for ${id}` }))
            : Effect.succeed(outcome.value)
        })
      )
  })

  const forward = (
    route: Route,
    request: IncomingMessage,
    body: Buffer,
    secret: Redacted.Redacted<string>
  ) =>
    Effect.gen(function* () {
      const upstream = new URL(route.upstream)
      const headers = outboundHeaders(
        request.headers,
        route,
        Redacted.value(secret),
        upstream.host,
        body.byteLength
      )

      const upstreamResponse = yield* Effect.tryPromise({
        try: (signal) =>
          fetch(upstream, {
            method: request.method ?? "GET",
            headers,
            signal,
            ...(body.byteLength > 0 ? { body } : {})
          }),
        catch: (cause) => new ProxyIoError({ reason: String(cause) })
      }).pipe(Effect.timeout(Duration.seconds(route.timeoutSeconds)))

      return upstreamResponse
    })

  const relay = (upstreamResponse: Response, response: ServerResponse) =>
    Effect.tryPromise({
      try: async () => {
        const headers: Record<string, string> = {}
        upstreamResponse.headers.forEach((value, name) => {
          if (name.toLowerCase() === "content-length") return
          headers[name] = value
        })
        // The body may be an open event stream of unknown length, so framing is
        // "read until close" rather than a declared length.
        headers["Connection"] = "close"
        response.writeHead(upstreamResponse.status, headers)

        if (upstreamResponse.body === null) {
          response.end()
          return
        }
        const reader = upstreamResponse.body.getReader()
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          response.write(Buffer.from(value))
        }
        response.end()
      },
      catch: (cause) => new ProxyIoError({ reason: String(cause) })
    })

  const handle = (request: IncomingMessage, response: ServerResponse) =>
    Effect.gen(function* () {
      const route = matchRoute(config, request.url ?? "/")
      if (Option.isNone(route)) {
        return yield* respondJson(response, 404, {
          error: `no route for ${request.url ?? "/"}`
        })
      }

      const body = yield* readBody(request)
      const secret = yield* cache.get(route.value.secretId)
      const first = yield* forward(route.value, request, body, secret)

      if (first.status !== 401) {
        return yield* relay(first, response)
      }

      // A rejected credential is the one failure re-resolving can fix, so it is
      // distinguished from an ordinary application error.
      yield* Effect.logInfo(`upstream returned 401, refreshing credential`)
      yield* cache.invalidate(route.value.secretId)
      const refreshed = yield* cache.get(route.value.secretId)
      const second = yield* forward(route.value, request, body, refreshed)
      if (second.status === 401) {
        return yield* respondJson(response, 401, {
          error: "upstream rejected the credential after refresh"
        })
      }
      return yield* relay(second, response)
    }).pipe(
      Effect.catchAll((cause) =>
        respondJson(response, 502, { error: `upstream error: ${cause}` })
      )
    )

  yield* Effect.acquireRelease(
    Effect.gen(function* () {
      const runtime = yield* Effect.runtime<never>()
      const runPromise = Runtime.runPromise(runtime)
      const server = createServer((request, response) => {
        void runPromise(handle(request, response))
      })
      yield* Effect.async<void, ProxyIoError>((resume) => {
        server.once("error", (cause) =>
          resume(Effect.fail(new ProxyIoError({ reason: String(cause) })))
        )
        server.listen(port, host, () => resume(Effect.void))
      })
      yield* Effect.logInfo(
        `listening on ${host}:${port}; routes: ${Object.keys(config.routes).sort().join(", ")}`
      )
      return server
    }),
    (server) =>
      Effect.async<void>((resume) => {
        server.close(() => resume(Effect.void))
      })
  )

  yield* Effect.never
})
