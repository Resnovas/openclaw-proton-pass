/*
 * Project: openclaw-proton-pass
 * File: payload.spec.ts
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

import { describe, expect, it } from "@effect/vitest"
import {
  ALLOWED_VALUES,
  sanitiseStack,
  toProperties,
  toReportableError,
  type TelemetryEvent
} from "@resnovas/opp-telemetry"

/** Values shaped like real credentials, for the leak assertions. */
const SECRETS = [
  "pass://OpenClaw/context7.com/API Key",
  "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc.def",
  "phc_yfq4iNbRQcM3rs2DQFK5PXostffCAdx9DgGePjFZTvG3",
  "sk-live-51H8kQ2eZvKYlo2C0N3mGhJp",
  "/home/someone/.config/proton-pass-cli/openclaw-agent-pat",
  "AKIAIOSFODNN7EXAMPLE",
  "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBg\n-----END PRIVATE KEY-----",
  "hunter2"
]

/** Build an event object with an extra field, bypassing the type system the
 * way a JavaScript caller or a careless refactor would. */
const withField = (key: string, value: unknown): TelemetryEvent =>
  ({ name: "proxy_started", routes: 1, [key]: value }) as unknown as TelemetryEvent

describe("toProperties: what it lets through", () => {
  it("keeps numeric measurements", () => {
    const properties = toProperties({
      name: "provider_resolved",
      requested: 3,
      resolved: 2,
      missing: 1,
      decorated: 1,
      durationMs: 412,
      sessionOutcome: "reused"
    })
    expect(properties).toEqual({
      requested: 3,
      resolved: 2,
      missing: 1,
      decorated: 1,
      durationMs: 412,
      sessionOutcome: "reused"
    })
  })

  it("keeps booleans", () => {
    const properties = toProperties({
      name: "proxy_request",
      status: 200,
      durationMs: 12,
      credentialRetried: true,
      outcome: "success"
    })
    expect(properties["credentialRetried"]).toBe(true)
  })

  it("keeps zero, which is a real measurement", () => {
    expect(toProperties({ name: "proxy_started", routes: 0 })).toEqual({ routes: 0 })
  })

  it("never transmits the event name as a property", () => {
    expect(toProperties({ name: "proxy_started", routes: 1 })).not.toHaveProperty("name")
  })

  it.each([...ALLOWED_VALUES])("keeps the declared literal %s", (literal) => {
    expect(toProperties(withField("field", literal))).toHaveProperty("field", literal)
  })
})

describe("toProperties: what it refuses", () => {
  it.each(SECRETS)("drops the credential-shaped value %#", (secret) => {
    const properties = toProperties(withField("detail", secret))
    expect(JSON.stringify(properties)).not.toContain(secret)
    expect(properties).not.toHaveProperty("detail")
  })

  it("drops a secret hidden under an innocuous field name", () => {
    // This is the case a name-based denylist cannot catch: the key looks
    // harmless, so only checking the value works.
    for (const key of ["count", "status", "outcome", "durationMs", "routes"]) {
      const properties = toProperties(withField(key, "pass://Vault/item/field"))
      expect(properties[key]).toBeUndefined()
    }
  })

  it("drops a secret that merely contains an allowed literal", () => {
    // Membership is exact, not substring: "success" being permitted must not
    // admit "success-token-abc123".
    const properties = toProperties(withField("outcome", "success-token-abc123"))
    expect(properties).not.toHaveProperty("outcome")
  })

  it.each([
    ["an object", { nested: "pass://Vault/item/field" }],
    ["an array", ["pass://Vault/item/field"]],
    ["null", null],
    ["undefined", undefined],
    ["a function", () => "secret"],
    ["a bigint", BigInt(42)],
    ["a symbol", Symbol("secret")]
  ])("drops %s", (_label, value) => {
    expect(toProperties(withField("detail", value))).not.toHaveProperty("detail")
  })

  it.each([NaN, Infinity, -Infinity])("drops the non-finite number %s", (value) => {
    expect(toProperties(withField("measurement", value))).not.toHaveProperty("measurement")
  })

  it("drops the empty string, which is not a declared literal", () => {
    expect(toProperties(withField("detail", ""))).not.toHaveProperty("detail")
  })

  it("survives an event carrying nothing but rejected fields", () => {
    const properties = toProperties(
      withField("a", "pass://x/y/z") as unknown as TelemetryEvent
    )
    expect(properties).toEqual({ routes: 1 })
  })
})

describe("toProperties: randomised leak search", () => {
  it("lets no randomly generated secret through, under any field name", () => {
    // A denylist passes the hand-written cases above and still fails here,
    // because it can only block names someone anticipated.
    const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_./:"
    const keys = ["v", "count", "id", "tag", "outcome", "value", "secret", "x1", "Ω"]
    let checked = 0

    for (let seed = 0; seed < 2000; seed++) {
      let candidate = ""
      let state = seed * 2654435761
      const length = 8 + (seed % 40)
      for (let index = 0; index < length; index++) {
        state = (state * 1103515245 + 12345) & 0x7fffffff
        candidate += alphabet[state % alphabet.length]
      }
      if (ALLOWED_VALUES.has(candidate)) continue

      const key = keys[seed % keys.length]!
      const properties = toProperties(withField(key, candidate))
      expect(JSON.stringify(properties)).not.toContain(candidate)
      checked++
    }

    expect(checked).toBeGreaterThan(1900)
  })
})

describe("sanitiseStack", () => {
  it("reduces an absolute path to a file name", () => {
    const stack = "Error: x\n    at resolve (/home/someone/project/libs/pass-cli/src/resolver.ts:42:9)"
    const sanitised = sanitiseStack(stack)
    expect(sanitised).toContain("resolver.ts:42:9")
    expect(sanitised).not.toContain("/home/someone")
  })

  it("keeps the function name, which is the diagnostic part", () => {
    const stack = "Error: x\n    at ensureSession (/a/b/c/session.ts:1:1)"
    expect(sanitiseStack(stack)).toContain("ensureSession")
  })

  it("handles a Windows path", () => {
    const stack = "Error: x\n    at run (C:\\Users\\someone\\app\\main.js:3:4)"
    const sanitised = sanitiseStack(stack)
    expect(sanitised).not.toContain("Users")
    expect(sanitised).toContain("main.js:3:4")
  })

  it("strips every frame, not just the first", () => {
    const stack = [
      "Error: x",
      "    at a (/home/someone/one.ts:1:1)",
      "    at b (/home/someone/two.ts:2:2)"
    ].join("\n")
    expect(sanitiseStack(stack)).not.toContain("/home/someone")
  })

  it("returns undefined when there is no stack", () => {
    expect(sanitiseStack(undefined)).toBeUndefined()
  })
})

describe("toReportableError", () => {
  it("carries the tag as both name and message", () => {
    const error = toReportableError("SessionError")
    expect(error.name).toBe("SessionError")
    expect(error.message).toBe("SessionError")
  })

  it("never carries the original message", () => {
    // Domain errors embed paths in their fields; only the tag is reportable.
    const original = new Error("could not read /home/someone/.config/secret-map.json")
    const reportable = toReportableError("SecretMapError", original.stack)
    expect(reportable.message).toBe("SecretMapError")
    expect(reportable.stack ?? "").not.toContain("/home/someone")
  })

  it("keeps a sanitised stack when one is supplied", () => {
    const reportable = toReportableError("ProxyIoError", "Error: x\n    at f (/a/b/c.ts:1:1)")
    expect(reportable.stack).toContain("c.ts:1:1")
  })
})

describe("toProperties: the second filter must not eat real data", () => {
  // Defence in depth is only free if it costs no diagnostics. A field name
  // that happens to match the denylist would vanish silently, so every event
  // in the union is checked field by field.
  const everyEvent: ReadonlyArray<TelemetryEvent> = [
    { name: "binary_started", binary: "resolver", nodeMajor: 22, installedAsPlugin: true },
    {
      name: "provider_resolved",
      requested: 3,
      resolved: 2,
      missing: 1,
      decorated: 1,
      durationMs: 5,
      sessionOutcome: "rebuilt"
    },
    { name: "provider_failed", requested: 2, errorTag: "SessionError", durationMs: 7 },
    { name: "session_established", sessionOutcome: "logged-in", durationMs: 9 },
    { name: "mcp_server_launched", outcome: "success", exitCode: 0, durationMs: 11 },
    { name: "proxy_started", routes: 2 },
    {
      name: "proxy_request",
      status: 200,
      durationMs: 13,
      credentialRetried: true,
      outcome: "success"
    },
    { name: "command_run", command: "doctor", outcome: "success", durationMs: 15 },
    { name: "doctor_report", passed: 4, failed: 1 },
    { name: "span_completed", span: "session.ensure", durationMs: 17, outcome: "success" },
    { name: "diagnostic", logId: "session.login_failed", level: "warn", count: 2 }
  ]

  it.each(everyEvent.map((event) => [event.name, event] as const))(
    "%s keeps every field it declares",
    (_name, event) => {
      const declared = Object.keys(event).filter((key) => key !== "name")
      const transmitted = Object.keys(toProperties(event))
      expect(transmitted.sort()).toEqual(declared.sort())
    }
  )

  it("covers every event in the union", () => {
    // If a new event is added without a case here, this fails rather than
    // letting an unchecked event ship.
    const names = new Set(everyEvent.map((event) => event.name))
    expect(names.size).toBe(everyEvent.length)
    expect(names.size).toBeGreaterThanOrEqual(11)
  })

  it("still drops a secret placed on a real event's real field", () => {
    const tampered = { ...everyEvent[1], sessionOutcome: "pass://Vault/i/f" } as TelemetryEvent
    expect(JSON.stringify(toProperties(tampered))).not.toContain("pass://")
  })
})
