/*
 * Project: openclaw-proton-pass
 * File: telemetry-leak.spec.ts
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
import { execFile } from "node:child_process"
import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { fileURLToPath } from "node:url"
import { gunzipSync, inflateSync } from "node:zlib"
import { makeWorkspace, type Workspace } from "../../../helpers/workspace.js"

/**
 * End-to-end proof that an enabled telemetry pipeline cannot emit a secret.
 *
 * The unit tests show the filter rejects credential-shaped values. This shows
 * the assembled system does too: the real built resolver resolves a real value
 * from a stub vault, with telemetry switched on and pointed at a collector that
 * keeps every byte sent. The value is then searched for across everything the
 * process transmitted.
 *
 * It asserts the resolution actually succeeded first. A test that proves
 * nothing leaked because nothing happened would be worthless.
 */
const RESOLVER = fileURLToPath(
  new URL("../../../../apps/resolver/dist/main.js", import.meta.url)
)

/** A value that cannot occur by chance, so any appearance is a real leak. */
const SENTINEL = "SENTINEL-SECRET-3f9a2c7e4b118d05-DO-NOT-TRANSMIT"

let server: Server | undefined
let workspace: Workspace | undefined

afterEach(async () => {
  if (server !== undefined) {
    await new Promise<void>((resolve) => server!.close(() => resolve()))
    server = undefined
  }
  workspace?.dispose()
  workspace = undefined
})

/** Collect every byte the process sends, decompressed where necessary. */
const startCollector = async (): Promise<{ url: string; bodies: Array<string> }> => {
  const bodies: Array<string> = []
  server = createServer((request, response) => {
    const chunks: Array<Buffer> = []
    request.on("data", (chunk: Buffer) => chunks.push(chunk))
    request.on("end", () => {
      const raw = Buffer.concat(chunks)
      // The SDK compresses payloads; inspect what was actually sent, not what
      // it would have looked like uncompressed.
      for (const decode of [
        () => raw.toString("utf8"),
        () => gunzipSync(raw).toString("utf8"),
        () => inflateSync(raw).toString("utf8")
      ]) {
        try {
          bodies.push(decode())
        } catch {
          // Not this encoding; try the next.
        }
      }
      bodies.push(request.url ?? "")
      bodies.push(JSON.stringify(request.headers))
      response.writeHead(200, { "Content-Type": "application/json" })
      response.end("{}")
    })
  })
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve))
  const { port } = server.address() as AddressInfo
  return { url: `http://127.0.0.1:${port}`, bodies }
}

const runResolver = (ids: ReadonlyArray<string>, env: Record<string, string>) =>
  new Promise<{ stdout: string; stderr: string }>((resolve) => {
    const child = execFile(
      process.execPath,
      [RESOLVER],
      { env: { ...process.env, ...env }, timeout: 60_000 },
      (_error, stdout, stderr) => resolve({ stdout, stderr })
    )
    child.stdin?.end(JSON.stringify({ protocolVersion: 1, provider: "protonpass", ids }))
  })

describe("an enabled telemetry pipeline", () => {
  it("resolves a real secret and transmits no trace of it", async () => {
    const collector = await startCollector()
    workspace = makeWorkspace({
      secretMap: '{"LEAK_CHECK":"pass://Vault/item/field"}',
      stub: { values: [SENTINEL] }
    })

    const { stdout } = await runResolver(["LEAK_CHECK"], {
      OPENCLAW_PROTONPASS_TELEMETRY: "true",
      OPENCLAW_PROTONPASS_POSTHOG_KEY: "phc_leak_check",
      OPENCLAW_PROTONPASS_POSTHOG_HOST: collector.url
    })

    // The resolution must genuinely have happened, or this proves nothing.
    const response = JSON.parse(stdout) as { values?: Record<string, string> }
    expect(response.values?.["LEAK_CHECK"]).toBe(SENTINEL)

    // Telemetry must have been active, or this proves nothing either.
    expect(collector.bodies.length).toBeGreaterThan(0)

    const transmitted = collector.bodies.join("\n")
    expect(transmitted).not.toContain(SENTINEL)
    // Not even a fragment of it.
    expect(transmitted).not.toContain("SENTINEL")
    expect(transmitted).not.toContain("3f9a2c7e4b118d05")
  }, 90_000)

  it("transmits no vault reference from the secret map", async () => {
    const collector = await startCollector()
    workspace = makeWorkspace({
      secretMap: '{"LEAK_CHECK":"pass://PrivateVault/some-service.example/API Key"}',
      stub: { values: [SENTINEL] }
    })

    await runResolver(["LEAK_CHECK"], {
      OPENCLAW_PROTONPASS_TELEMETRY: "true",
      OPENCLAW_PROTONPASS_POSTHOG_KEY: "phc_leak_check",
      OPENCLAW_PROTONPASS_POSTHOG_HOST: collector.url
    })

    const transmitted = collector.bodies.join("\n")
    // A vault path is not a credential, but it describes where secrets live.
    expect(transmitted).not.toContain("pass://")
    expect(transmitted).not.toContain("PrivateVault")
    expect(transmitted).not.toContain("some-service.example")
  }, 90_000)

  it("transmits no filesystem path, even when resolution fails", async () => {
    const collector = await startCollector()
    workspace = makeWorkspace({})

    await runResolver(["LEAK_CHECK"], {
      OPENCLAW_PROTONPASS_TELEMETRY: "true",
      OPENCLAW_PROTONPASS_POSTHOG_KEY: "phc_leak_check",
      OPENCLAW_PROTONPASS_POSTHOG_HOST: collector.url,
      OPENCLAW_PROTONPASS_SECRET_MAP: `${workspace.dir}/absent-map.json`
    })

    const transmitted = collector.bodies.join("\n")
    // The error path is where a path is most likely to escape: the domain
    // error carries one in its fields and the log line prints it.
    expect(transmitted).not.toContain(workspace.dir)
    expect(transmitted).not.toContain("absent-map.json")
    expect(transmitted).not.toContain("/tmp/")
  }, 90_000)

  it("still reports the failure it declined to describe", async () => {
    const collector = await startCollector()
    workspace = makeWorkspace({})

    await runResolver(["LEAK_CHECK"], {
      OPENCLAW_PROTONPASS_TELEMETRY: "true",
      OPENCLAW_PROTONPASS_POSTHOG_KEY: "phc_leak_check",
      OPENCLAW_PROTONPASS_POSTHOG_HOST: collector.url,
      OPENCLAW_PROTONPASS_SECRET_MAP: `${workspace.dir}/absent-map.json`
    })

    // Redaction must not cost diagnosis: the tag identifying what went wrong
    // is still reported, without the path that caused it.
    const transmitted = collector.bodies.join("\n")
    expect(transmitted).toContain("SecretMapError")
    expect(transmitted).toContain("provider_failed")
  }, 90_000)

  it("sends nothing at all when telemetry is off", async () => {
    const collector = await startCollector()
    workspace = makeWorkspace({
      secretMap: '{"LEAK_CHECK":"pass://Vault/item/field"}',
      stub: { values: [SENTINEL] }
    })

    const { stdout } = await runResolver(["LEAK_CHECK"], {
      OPENCLAW_PROTONPASS_POSTHOG_HOST: collector.url
    })

    expect(JSON.parse(stdout).values["LEAK_CHECK"]).toBe(SENTINEL)
    expect(collector.bodies).toHaveLength(0)
  }, 90_000)
})
