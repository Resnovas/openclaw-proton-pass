/*
 * Project: openclaw-proton-pass
 * File: audit.spec.ts
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
import { auditContext } from "@resnovas/opp-config"
import { ConfigProvider, Effect, Option } from "effect"

const read = (env: Record<string, string>) =>
  Effect.runSync(
    auditContext.pipe(
      Effect.withConfigProvider(ConfigProvider.fromMap(new Map(Object.entries(env))))
    )
  )

describe("auditContext", () => {
  it("reports nothing when neither variable is set", () => {
    const context = read({})
    expect(Option.isNone(context.label)).toBe(true)
    expect(Option.isNone(context.profile)).toBe(true)
  })

  it("reads the operator's label", () => {
    expect(read({ OPENCLAW_PROTONPASS_AUDIT_LABEL: "upstash box" }).label).toEqual(
      Option.some("upstash box")
    )
  })

  it("reads the OpenClaw profile without being configured to", () => {
    // OpenClaw sets it, so a multi-profile install distinguishes itself in
    // the audit log with no extra setup.
    expect(read({ OPENCLAW_PROFILE: "work" }).profile).toEqual(Option.some("work"))
  })

  it("trims what it reads", () => {
    expect(read({ OPENCLAW_PROTONPASS_AUDIT_LABEL: "  box  " }).label).toEqual(
      Option.some("box")
    )
  })

  it("treats a variable exported empty as unset", () => {
    expect(Option.isNone(read({ OPENCLAW_PROTONPASS_AUDIT_LABEL: "   " }).label)).toBe(true)
  })

  it("never fails, so a bad provider cannot stop a resolution", () => {
    // Its caller is on the resolution path. A ConfigError there would turn a
    // missing optional label into a failed credential lookup.
    expect(Option.isNone(read({}).profile)).toBe(true)
  })
})
