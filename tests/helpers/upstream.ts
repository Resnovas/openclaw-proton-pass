/*
 * Project: openclaw-proton-pass
 * File: upstream.ts
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

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"

export interface Upstream {
  readonly url: string
  readonly requests: Array<{ method: string; headers: Record<string, string | undefined> }>
  readonly close: () => Promise<void>
}

/**
 * A stand-in MCP server.
 *
 * `handler` decides each response, so a test can make the upstream reject the
 * first credential and accept the second - the sequence the proxy's refresh
 * path exists for.
 */
export const startUpstream = async (
  handler: (
    request: IncomingMessage,
    response: ServerResponse,
    index: number
  ) => void
): Promise<Upstream> => {
  const requests: Array<{ method: string; headers: Record<string, string | undefined> }> = []
  let index = 0
  const server: Server = createServer((request, response) => {
    requests.push({ method: request.method ?? "", headers: { ...request.headers } })
    handler(request, response, index++)
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const { port } = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${port}/mcp`,
    requests,
    close: () => new Promise<void>((resolve) => server.close(() => resolve()))
  }
}

/** Wait until a TCP port answers, so a test never races the listener. */
export const waitForPort = async (port: number, attempts = 100): Promise<void> => {
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      await fetch(`http://127.0.0.1:${port}/__probe`, { method: "GET" })
      return
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
  }
  throw new Error(`port ${port} never answered`)
}

/** An ephemeral port number that is very unlikely to collide. */
export const freePort = (): number => 20000 + Math.floor(Math.random() * 20000)
