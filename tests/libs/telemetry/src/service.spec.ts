/*
 * Project: openclaw-proton-pass
 * File: service.spec.ts
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
import { Telemetry } from "@resnovas/opp-telemetry"
import { NodeContext } from "@effect/platform-node"
import { Effect, Layer } from "effect"
import { createServer, type Server } from "node:http"
import { AddressInfo } from "node:net"

let server: Server | undefined

const startCollector = async (): Promise<{ url: string; received: Array<unknown> }> => {
  const received: Array<unknown> = []
  server = createServer((request, response) => {
    const chunks: Array<Buffer> = []
    request.on("data", (chunk: Buffer) => chunks.push(chunk))
    request.on("end", () => {
      received.push({ path: request.url, bytes: Buffer.concat(chunks).byteLength })
      response.writeHead(200, { "Content-Type": "application/json" })
      response.end("{}")
    })
  })
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve))
  const { port } = server.address() as AddressInfo
  return { url: `http://127.0.0.1:${port}`, received }
}

afterEach(async () => {
  delete process.env["OPENCLAW_PROTONPASS_POSTHOG_KEY"]
  // Both are restored rather than deleted: deleting either would let the
  // shipped defaults take over for the rest of the file, and later tests would
  // report to the real project instead of a local collector.
  process.env["OPENCLAW_PROTONPASS_POSTHOG_HOST"] = "http://127.0.0.1:1"
  // Restored rather than deleted: deleting it would let the shipped default
  // take over for the rest of the file, and later tests would report to the
  // real project instead of a local collector.
  process.env["OPENCLAW_PROTONPASS_TELEMETRY"] = "false"
  if (server !== undefined) {
    await new Promise<void>((resolve) => server!.close(() => resolve()))
    server = undefined
  }
})

const use = <A>(body: (telemetry: Telemetry) => Effect.Effect<A>) =>
  Effect.gen(function* () {
    const telemetry = yield* Telemetry
    return yield* body(telemetry)
  }).pipe(
    Effect.provide(Layer.provideMerge(Telemetry.Default, NodeContext.layer)),
    Effect.runPromise
  )

describe("Telemetry when disabled", () => {
  it("is active by default, and inert once switched off", async () => {
    // The shipped default is on; the suite's setup file turns it off so tests
    // never report to the real project. Observing the default therefore has to
    // point at a local collector first, or this test would be the one leak.
    const collector = await startCollector()
    process.env["OPENCLAW_PROTONPASS_POSTHOG_HOST"] = collector.url
    delete process.env["OPENCLAW_PROTONPASS_TELEMETRY"]
    const onByDefault = await use((telemetry) => Effect.succeed(telemetry.active))
    process.env["OPENCLAW_PROTONPASS_TELEMETRY"] = "false"
    const offWhenAsked = await use((telemetry) => Effect.succeed(telemetry.active))
    expect(onByDefault).toBe(true)
    expect(offWhenAsked).toBe(false)
  })

  it("accepts a capture without sending anything", async () => {
    process.env["OPENCLAW_PROTONPASS_TELEMETRY"] = "false"
    const result = await use((telemetry) =>
      telemetry.capture({ name: "noop", properties: { count: 1 } }).pipe(Effect.as("done"))
    )
    expect(result).toBe("done")
  })

  it("flushes without error", async () => {
    const result = await use((telemetry) => telemetry.flush.pipe(Effect.as("flushed")))
    expect(result).toBe("flushed")
  })

  it("stays inert when the project key is explicitly emptied", async () => {
    // An operator who wants telemetry on but no reporting to the default
    // project clears the key rather than having to run their own PostHog.
    process.env["OPENCLAW_PROTONPASS_TELEMETRY"] = "true"
    process.env["OPENCLAW_PROTONPASS_POSTHOG_KEY"] = ""
    const active = await use((telemetry) => Effect.succeed(telemetry.active))
    expect(active).toBe(false)
  })

  it("stays inert when the key is only whitespace", async () => {
    process.env["OPENCLAW_PROTONPASS_TELEMETRY"] = "true"
    process.env["OPENCLAW_PROTONPASS_POSTHOG_KEY"] = "   "
    const active = await use((telemetry) => Effect.succeed(telemetry.active))
    expect(active).toBe(false)
  })

  it("stays inert when a key is present but reporting is off", async () => {
    process.env["OPENCLAW_PROTONPASS_TELEMETRY"] = "false"
    process.env["OPENCLAW_PROTONPASS_POSTHOG_KEY"] = "phc_test"
    const active = await use((telemetry) => Effect.succeed(telemetry.active))
    expect(active).toBe(false)
  })

  it("carries a default project so reporting needs no further setup", async () => {
    // The build ships a write-only ingestion key, so an install reports
    // without anyone configuring a project first.
    const collector = await startCollector()
    process.env["OPENCLAW_PROTONPASS_TELEMETRY"] = "true"
    process.env["OPENCLAW_PROTONPASS_POSTHOG_HOST"] = collector.url
    const active = await use((telemetry) => Effect.succeed(telemetry.active))
    expect(active).toBe(true)
  })
})

describe("Telemetry when enabled", () => {
  it("becomes active once both the flag and the key are set", async () => {
    const collector = await startCollector()
    process.env["OPENCLAW_PROTONPASS_TELEMETRY"] = "true"
    process.env["OPENCLAW_PROTONPASS_POSTHOG_KEY"] = "phc_test"
    process.env["OPENCLAW_PROTONPASS_POSTHOG_HOST"] = collector.url

    const active = await use((telemetry) =>
      telemetry.capture({ name: "resolve_completed", properties: { resolved: 2 } }).pipe(
        Effect.zipRight(telemetry.flush),
        Effect.as(telemetry.active)
      )
    )
    expect(active).toBe(true)
  })

  it("captures an event with no properties", async () => {
    const collector = await startCollector()
    process.env["OPENCLAW_PROTONPASS_TELEMETRY"] = "true"
    process.env["OPENCLAW_PROTONPASS_POSTHOG_KEY"] = "phc_test"
    process.env["OPENCLAW_PROTONPASS_POSTHOG_HOST"] = collector.url

    const result = await use((telemetry) =>
      telemetry
        .capture({ name: "bare" })
        .pipe(Effect.zipRight(telemetry.flush), Effect.as("ok"))
    )
    expect(result).toBe("ok")
  })

  it("delivers the event to the configured host", async () => {
    const collector = await startCollector()
    process.env["OPENCLAW_PROTONPASS_TELEMETRY"] = "true"
    process.env["OPENCLAW_PROTONPASS_POSTHOG_KEY"] = "phc_test"
    process.env["OPENCLAW_PROTONPASS_POSTHOG_HOST"] = collector.url

    await use((telemetry) =>
      telemetry
        .capture({ name: "resolve_completed", properties: { requested: 1, secretId: "leak" } })
        .pipe(Effect.zipRight(telemetry.flush))
    )

    // The payload is compressed, so assert that a delivery reached the
    // configured host; what the payload may contain is covered by the scrub
    // tests, which are the guard that matters for secrecy.
    expect(collector.received.length).toBeGreaterThan(0)
  })
})

describe("Telemetry when enabled: every capture kind", () => {
  const enable = (url: string) => {
    process.env["OPENCLAW_PROTONPASS_TELEMETRY"] = "true"
    process.env["OPENCLAW_PROTONPASS_POSTHOG_KEY"] = "phc_test"
    process.env["OPENCLAW_PROTONPASS_POSTHOG_HOST"] = url
  }

  it("reports an error by tag", async () => {
    const collector = await startCollector()
    enable(collector.url)
    const result = await use((telemetry) =>
      telemetry
        .captureError("SessionError", "Error: x\n    at f (/home/someone/a.ts:1:1)")
        .pipe(Effect.zipRight(telemetry.flush), Effect.as("sent"))
    )
    expect(result).toBe("sent")
    expect(collector.received.length).toBeGreaterThan(0)
  })

  it("reports an error with no stack", async () => {
    const collector = await startCollector()
    enable(collector.url)
    const result = await use((telemetry) =>
      telemetry.captureError("Unknown").pipe(Effect.zipRight(telemetry.flush), Effect.as("sent"))
    )
    expect(result).toBe("sent")
  })

  it("reports a structured diagnostic", async () => {
    const collector = await startCollector()
    enable(collector.url)
    await use((telemetry) =>
      telemetry
        .diagnostic("session.login_failed", "warn")
        .pipe(Effect.zipRight(telemetry.flush))
    )
    expect(collector.received.length).toBeGreaterThan(0)
  })

  it("reports a diagnostic with an explicit count", async () => {
    const collector = await startCollector()
    enable(collector.url)
    await use((telemetry) =>
      telemetry
        .diagnostic("resolver.empty_value", "warn", 4)
        .pipe(Effect.zipRight(telemetry.flush))
    )
    expect(collector.received.length).toBeGreaterThan(0)
  })

  it("records a span around a succeeding effect and returns its value", async () => {
    const collector = await startCollector()
    enable(collector.url)
    const value = await use((telemetry) =>
      telemetry
        .span("session.ensure", Effect.succeed("result"))
        .pipe(Effect.tap(() => telemetry.flush))
    )
    expect(value).toBe("result")
    expect(collector.received.length).toBeGreaterThan(0)
  })

  it("records a span around a failing effect and preserves the failure", async () => {
    const collector = await startCollector()
    enable(collector.url)
    const outcome = await use((telemetry) =>
      telemetry
        .span("resolver.load_map", Effect.fail("boom" as const))
        .pipe(Effect.either, Effect.tap(() => telemetry.flush))
    )
    expect(outcome._tag).toBe("Left")
  })

  it("records a span even when reporting is inert", async () => {
    // The span wrapper must behave identically either way, or enabling
    // telemetry would change program behaviour rather than just observation.
    const value = await use((telemetry) => telemetry.span("cli.doctor", Effect.succeed(7)))
    expect(value).toBe(7)
  })

  it("preserves a failure through an inert span", async () => {
    const outcome = await use((telemetry) =>
      telemetry.span("cli.setup", Effect.fail("nope" as const)).pipe(Effect.either)
    )
    expect(outcome._tag).toBe("Left")
  })

  it("accepts an inert diagnostic and error report", async () => {
    const result = await use((telemetry) =>
      telemetry
        .diagnostic("cli.check_failed", "warn", 2)
        .pipe(
          Effect.zipRight(telemetry.captureError("ProtocolError")),
          Effect.as("ok")
        )
    )
    expect(result).toBe("ok")
  })
})
