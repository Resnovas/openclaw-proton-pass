/*
 * Project: openclaw-proton-pass
 * File: logs.spec.ts
 * Last Modified: 2026-09-19
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

import { describe, expect, it } from "@effect/vitest"
import { sendLogs, toOtlpLogs, type LogResource } from "@resnovas/opp-telemetry"
import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"

const resource: LogResource = {
  serviceName: "openclaw-proton-pass",
  serviceVersion: "1.2.3",
  environment: "production",
  installId: "11111111-2222-3333-4444-555555555555",
  os: "linux",
  nodeVersion: "22.0.0"
}

/** Reach into the OTLP shape without asserting on `any`. */
interface OtlpBody {
  resourceLogs: ReadonlyArray<{
    resource: { attributes: ReadonlyArray<{ key: string; value: Record<string, unknown> }> }
    scopeLogs: ReadonlyArray<{
      logRecords: ReadonlyArray<{
        severityNumber: number
        severityText: string
        body: { stringValue: string }
        attributes: ReadonlyArray<{ key: string; value: Record<string, unknown> }>
      }>
    }>
  }>
}

const build = (...args: Parameters<typeof toOtlpLogs>) => toOtlpLogs(...args) as OtlpBody
const records = (body: OtlpBody) => body.resourceLogs[0]!.scopeLogs[0]!.logRecords

describe("toOtlpLogs", () => {
  it("puts the log id in the body rather than a message", () => {
    // Message text routinely contains a filesystem path here, so an id is the
    // only thing that may travel.
    const body = build([{ logId: "session.login_failed", level: "warn", count: 1 }], resource)
    expect(records(body)[0]!.body.stringValue).toBe("session.login_failed")
  })

  it.each([
    ["debug", 5, "DEBUG"],
    ["info", 9, "INFO"],
    ["warn", 13, "WARN"],
    ["error", 17, "ERROR"]
  ] as const)("maps %s to OTLP severity %i", (level, number, text) => {
    const body = build([{ logId: "cli.check_failed", level, count: 1 }], resource)
    expect(records(body)[0]!.severityNumber).toBe(number)
    expect(records(body)[0]!.severityText).toBe(text)
  })

  it("carries the count as an attribute", () => {
    const body = build([{ logId: "resolver.empty_value", level: "warn", count: 4 }], resource)
    const attributes = records(body)[0]!.attributes
    expect(attributes.find((a) => a.key === "log.count")?.value).toEqual({ intValue: "4" })
  })

  it("carries the person key as a log attribute", () => {
    // PostHog joins logs to a person through a log attribute; a resource
    // attribute alone leaves the record unattached to anyone.
    const body = build([{ logId: "session.probe_failed", level: "info", count: 1 }], resource)
    const attributes = records(body)[0]!.attributes
    expect(attributes.find((a) => a.key === "posthogDistinctId")?.value).toEqual({
      stringValue: resource.installId
    })
  })

  it("identifies the install on the resource as well", () => {
    const body = build([{ logId: "cli.config_seeded", level: "info", count: 1 }], resource)
    const attributes = body.resourceLogs[0]!.resource.attributes
    expect(attributes.find((a) => a.key === "service.instance.id")?.value).toEqual({
      stringValue: resource.installId
    })
    expect(attributes.find((a) => a.key === "service.name")?.value).toEqual({
      stringValue: "openclaw-proton-pass"
    })
  })

  it("emits one record per diagnostic", () => {
    const body = build(
      [
        { logId: "proxy.route_not_found", level: "warn", count: 1 },
        { logId: "proxy.credential_refreshed", level: "info", count: 2 }
      ],
      resource
    )
    expect(records(body)).toHaveLength(2)
  })

  it("produces an empty record list for no diagnostics", () => {
    expect(records(build([], resource))).toHaveLength(0)
  })
})

describe("sendLogs", () => {
  let server: Server | undefined

  const start = async () => {
    const received: Array<{ url: string; auth: string; body: string }> = []
    server = createServer((request, response) => {
      const chunks: Array<Buffer> = []
      request.on("data", (chunk: Buffer) => chunks.push(chunk))
      request.on("end", () => {
        received.push({
          url: request.url ?? "",
          auth: String(request.headers.authorization ?? ""),
          body: Buffer.concat(chunks).toString("utf8")
        })
        response.writeHead(200)
        response.end("{}")
      })
    })
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve))
    const { port } = server.address() as AddressInfo
    return { url: `http://127.0.0.1:${port}`, received }
  }

  const stop = async () => {
    if (server !== undefined) {
      await new Promise<void>((resolve) => server!.close(() => resolve()))
      server = undefined
    }
  }

  it("posts to the OTLP logs endpoint with the project key", async () => {
    const collector = await start()
    await sendLogs(collector.url, "phc_test", [
      { logId: "session.probe_failed", level: "info", count: 1 }
    ], resource)
    await stop()

    expect(collector.received).toHaveLength(1)
    expect(collector.received[0]!.url).toBe("/i/v1/logs")
    expect(collector.received[0]!.auth).toBe("Bearer phc_test")
    expect(collector.received[0]!.body).toContain("session.probe_failed")
  })

  it("tolerates a trailing slash on the host", async () => {
    const collector = await start()
    await sendLogs(`${collector.url}/`, "phc_test", [
      { logId: "cli.check_failed", level: "warn", count: 1 }
    ], resource)
    await stop()
    expect(collector.received[0]!.url).toBe("/i/v1/logs")
  })

  it("sends nothing when there are no records", async () => {
    const collector = await start()
    await sendLogs(collector.url, "phc_test", [], resource)
    await stop()
    expect(collector.received).toHaveLength(0)
  })

  it("never throws when the collector is unreachable", async () => {
    // A logging backend that is down must not fail a credential resolution.
    await expect(
      sendLogs("http://127.0.0.1:1", "phc_test", [
        { logId: "resolver.map_unreadable", level: "error", count: 1 }
      ], resource)
    ).resolves.toBeUndefined()
  })
})
