/*
 * Project: openclaw-proton-pass
 * File: cli-errors.spec.ts
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

import { describe, expect, it } from "@effect/vitest"
import {
  AuthError,
  CliExit,
  CliUnsupported,
  ConnectUnsupported,
  formatCliError,
  ItemError,
  VaultError
} from "@resnovas/opp-onepassword-compat"

describe("formatCliError", () => {
  const unsupported = new CliUnsupported({
    command: "op document create",
    feature: "documents",
    limitation: "Proton Pass stores notes and SSH keys instead.",
    suggestion: "Use pass-cli item create note --help."
  })

  it("formats unsupported commands for human stderr", () => {
    const message = formatCliError(unsupported, "human")
    expect(message).toContain("[ERROR] op document create is not supported.")
    expect(message).toContain("documents")
    expect(message).toContain("pass-cli item create note --help.")
  })

  it("formats unsupported commands for JSON stderr", () => {
    const message = formatCliError(unsupported, "json")
    expect(JSON.parse(message)).toEqual({
      code: "unsupported",
      command: "op document create",
      feature: "documents",
      message: "Proton Pass stores notes and SSH keys instead."
    })
  })

  it("formats connect unsupported errors in both modes", () => {
    const error = new ConnectUnsupported({
      operation: "getFiles",
      feature: "documents",
      limitation: "no attachments"
    })
    expect(formatCliError(error, "human")).toContain("getFiles")
    expect(JSON.parse(formatCliError(error, "json")).operation).toBe("getFiles")
  })

  it("formats cli exit, auth, vault, and item failures", () => {
    expect(formatCliError(new CliExit({ exitCode: 2, stderr: "boom\n", command: "pass-cli x" }), "human")).toContain(
      "exited 2"
    )
    expect(JSON.parse(formatCliError(new AuthError({ reason: "bad token" }), "json")).code).toBe("auth")
    expect(formatCliError(new VaultError({ reason: "vault list failed" }), "human")).toContain("vault list failed")
    expect(formatCliError(new ItemError({ reason: "field missing" }), "json")).toContain("field missing")
  })
})
