/*
 * Project: openclaw-proton-pass
 * File: server.ts
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
 * The running 1Password Connect compatibility HTTP server.
 *
 * Serves the Connect API surface backed by Proton Pass through
 * {@link OnePasswordCompat}. Vault routes require a Bearer token; `/heartbeat`
 * and `/health` do not.
 *
 * @module
 * @since 0.1.0
 */

import { FileSystem } from "@effect/platform"
import { CommandExecutor } from "@effect/platform"
import { Paths, commandTimeoutMillis } from "@resnovas/opp-config"
import { splitAddress } from "@resnovas/opp-domain"
import {
  encodeConnectError,
  OnePasswordCompat,
  ConnectUnsupported,
  type ConnectEncodableError
} from "@resnovas/opp-onepassword-compat"
import { CONNECT_API_VERSION } from "@resnovas/opp-onepassword-contract"
import { PassSession } from "@resnovas/opp-pass-cli"
import { Telemetry } from "@resnovas/opp-telemetry"
import { Data, Effect, Runtime } from "effect"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { extractBearerToken, requireBearerAuth } from "./auth.js"
import { loadConfig } from "./config.js"

/**
 * Raised when the HTTP listener or socket I/O fails.
 *
 * @category errors
 * @since 0.1.0
 */
export class ConnectIoError extends Data.TaggedError("ConnectIoError")<{
  readonly reason: string
}> {}

/**
 * A matched Connect route and its path parameters.
 *
 * @category models
 * @since 0.1.0
 */
export type ConnectRoute =
  | { readonly _tag: "heartbeat" }
  | { readonly _tag: "health" }
  | { readonly _tag: "activity" }
  | { readonly _tag: "listVaults" }
  | { readonly _tag: "getVault"; readonly vaultId: string }
  | { readonly _tag: "listItems"; readonly vaultId: string }
  | { readonly _tag: "createItem"; readonly vaultId: string }
  | { readonly _tag: "getItem"; readonly vaultId: string; readonly itemId: string }
  | { readonly _tag: "replaceItem"; readonly vaultId: string; readonly itemId: string }
  | { readonly _tag: "patchItem"; readonly vaultId: string; readonly itemId: string }
  | { readonly _tag: "deleteItem"; readonly vaultId: string; readonly itemId: string }
  | {
      readonly _tag: "fileRoute"
      readonly vaultId: string
      readonly itemId: string
      readonly operation: string
    }
  | { readonly _tag: "notFound" }

const isEncodable = (error: unknown): error is ConnectEncodableError =>
  typeof error === "object" &&
  error !== null &&
  "_tag" in error &&
  (error._tag === "ConnectUnauthorized" ||
    error._tag === "ConnectForbidden" ||
    error._tag === "ConnectNotFound" ||
    error._tag === "ConnectBadRequest" ||
    error._tag === "ConnectUnsupported" ||
    error._tag === "AuthError" ||
    error._tag === "VaultError" ||
    error._tag === "ItemError")

/**
 * Normalise a request URL pathname for routing.
 *
 * @param request - the inbound HTTP request
 * @returns the pathname without query string
 *
 * @category utils
 * @since 0.1.0
 */
export const requestPath = (request: IncomingMessage): string => {
  const raw = request.url ?? "/"
  const index = raw.indexOf("?")
  return index === -1 ? raw : raw.slice(0, index)
}

/**
 * Match a pathname and HTTP method to a Connect route.
 *
 * @remarks
 * Total over known Connect paths. File attachment routes are recognised and
 * routed to {@link ConnectRoute._tag} `"fileRoute"` so the handler can return
 * {@link ConnectUnsupported}.
 *
 * @param method - the HTTP method
 * @param pathname - the request pathname
 * @returns the matched route
 *
 * @category utils
 * @since 0.1.0
 *
 * @example
 * import { matchConnectRoute } from "@resnovas/opp-connect/server"
 *
 * assert.deepStrictEqual(matchConnectRoute("GET", "/heartbeat"), { _tag: "heartbeat" })
 * assert.deepStrictEqual(matchConnectRoute("GET", "/v1/vaults"), { _tag: "listVaults" })
 * assert.deepStrictEqual(matchConnectRoute("GET", "/v1/vaults/share-1/items"), {
 *   _tag: "listItems",
 *   vaultId: "share-1"
 * })
 */
export const matchConnectRoute = (method: string, pathname: string): ConnectRoute => {
  if (pathname === "/heartbeat") return { _tag: "heartbeat" }
  if (pathname === "/health") return { _tag: "health" }
  if (pathname === "/v1/activity") return { _tag: "activity" }

  const segments = pathname.split("/").filter((segment) => segment.length > 0)
  if (segments[0] !== "v1" || segments[1] !== "vaults") {
    return { _tag: "notFound" }
  }

  if (segments.length === 2) {
    return method === "GET" ? { _tag: "listVaults" } : { _tag: "notFound" }
  }

  const vaultId = segments[2]!
  if (segments.length === 3) {
    return method === "GET" ? { _tag: "getVault", vaultId } : { _tag: "notFound" }
  }

  if (segments[3] !== "items") {
    return { _tag: "notFound" }
  }

  if (segments.length === 4) {
    switch (method) {
      case "GET":
        return { _tag: "listItems", vaultId }
      case "POST":
        return { _tag: "createItem", vaultId }
      default:
        return { _tag: "notFound" }
    }
  }

  const itemId = segments[4]!
  if (segments.length === 5) {
    switch (method) {
      case "GET":
        return { _tag: "getItem", vaultId, itemId }
      case "PUT":
        return { _tag: "replaceItem", vaultId, itemId }
      case "PATCH":
        return { _tag: "patchItem", vaultId, itemId }
      case "DELETE":
        return { _tag: "deleteItem", vaultId, itemId }
      default:
        return { _tag: "notFound" }
    }
  }

  if (segments[5] === "files") {
    return {
      _tag: "fileRoute",
      vaultId,
      itemId,
      operation: `${method} ${pathname}`
    }
  }

  return { _tag: "notFound" }
}

const respondText = (response: ServerResponse, status: number, body: string, contentType: string) =>
  Effect.sync(() => {
    const encoded = Buffer.from(body)
    response.writeHead(status, {
      "Content-Type": contentType,
      "Content-Length": String(encoded.byteLength),
      Connection: "close"
    })
    response.end(encoded)
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

const respondConnectError = (response: ServerResponse, error: ConnectEncodableError) => {
  const body = encodeConnectError(error)
  return respondJson(response, body.status, body)
}

const unsupportedWrite = (operation: string) =>
  new ConnectUnsupported({
    operation,
    feature: "Connect HTTP write",
    limitation: "write operations are not yet available through this server"
  })

export const handleRoute = (
  compat: OnePasswordCompat,
  route: ConnectRoute,
  response: ServerResponse
) =>
  Effect.gen(function* () {
    switch (route._tag) {
      case "heartbeat":
        return yield* respondText(response, 200, ".", "text/plain")
      case "health": {
        const body = yield* compat.whoami().pipe(
          Effect.map((info) => ({
            name: "1Password Connect API",
            version: CONNECT_API_VERSION,
            protonPass: {
              session: "active" as const,
              accountUuid: info.accountUuid,
              ...(info.email === undefined ? {} : { email: info.email }),
              ...(info.name === undefined ? {} : { name: info.name })
            }
          })),
          Effect.catchAll(() =>
            Effect.succeed({
              name: "1Password Connect API",
              version: CONNECT_API_VERSION,
              protonPass: { session: "inactive" as const }
            })
          )
        )
        return yield* respondJson(response, 200, body)
      }
      case "activity":
        return yield* respondConnectError(
          response,
          new ConnectUnsupported({
            operation: "GET /v1/activity",
            feature: "activity log",
            limitation: "Connect activity log is a 1Password Connect Server feature"
          })
        )
      case "listVaults": {
        const vaults = yield* compat.listVaults()
        return yield* respondJson(response, 200, vaults)
      }
      case "getVault": {
        const vault = yield* compat.getVault(route.vaultId)
        return yield* respondJson(response, 200, vault)
      }
      case "listItems": {
        const items = yield* compat.listItems(route.vaultId)
        return yield* respondJson(response, 200, items)
      }
      case "getItem": {
        const item = yield* compat.getItem(route.vaultId, route.itemId)
        return yield* respondJson(response, 200, item)
      }
      case "createItem":
        return yield* respondConnectError(response, unsupportedWrite("POST item"))
      case "replaceItem":
        return yield* respondConnectError(response, unsupportedWrite("PUT item"))
      case "patchItem":
        return yield* respondConnectError(response, unsupportedWrite("PATCH item"))
      case "deleteItem":
        return yield* respondConnectError(response, unsupportedWrite("DELETE item"))
      case "fileRoute":
        return yield* respondConnectError(
          response,
          new ConnectUnsupported({
            operation: route.operation,
            feature: "document file attachments",
            limitation: "Proton Pass has no document file attachments"
          })
        )
      case "notFound":
        return yield* respondJson(response, 404, {
          status: 404,
          message: "route not found"
        })
      default: {
        const unreachable: never = route
        return unreachable
      }
    }
  })

/**
 * The running Connect HTTP server.
 *
 * @remarks
 * Listens on the configured loopback address until interrupted. Every `/v1/*`
 * route validates the Bearer token before dispatching.
 *
 * @category entrypoints
 * @since 0.1.0
 */
export const serve = Effect.gen(function* () {
  const config = yield* loadConfig
  const compat = yield* OnePasswordCompat
  const telemetry = yield* Telemetry
  const { host, port } = splitAddress(config.listen)

  const handle = (request: IncomingMessage, response: ServerResponse) =>
    Effect.gen(function* () {
      const method = request.method ?? "GET"
      const pathname = requestPath(request)
      const route = matchConnectRoute(method, pathname)
      const needsAuth = pathname.startsWith("/v1/")

      if (needsAuth) {
        const token = extractBearerToken(request.headers)
        yield* requireBearerAuth(compat, token)
      }

      return yield* handleRoute(compat, route, response)
    }).pipe(
      Effect.catchAll((cause) => {
        if (isEncodable(cause)) {
          return respondConnectError(response, cause)
        }
        return telemetry.captureError("Unknown").pipe(
          Effect.zipRight(
            respondJson(response, 500, {
              status: 500,
              message: "internal server error"
            })
          )
        )
      })
    )

  return yield* Effect.acquireRelease(
    Effect.gen(function* () {
      type ServerRuntime =
        | OnePasswordCompat
        | PassSession
        | Paths
        | Telemetry
        | typeof commandTimeoutMillis
        | CommandExecutor.CommandExecutor
        | FileSystem.FileSystem
      const runtime = yield* Effect.runtime<ServerRuntime>()
      const runPromise = Runtime.runPromise(runtime)
      const server = createServer((request, response) => {
        void runPromise(handle(request, response))
      })
      yield* Effect.async<void, ConnectIoError>((resume) => {
        server.once("error", (cause) =>
          resume(Effect.fail(new ConnectIoError({ reason: String(cause) })))
        )
        server.listen(port, host, () => resume(Effect.void))
      })
      yield* Effect.logInfo(`Connect server listening on ${host}:${port}`)
      return server
    }),
    (server) =>
      Effect.async<void>((resume) => {
        server.close(() => resume(Effect.void))
      })
  )
})
