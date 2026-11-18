/*
 * Project: openclaw-proton-pass
 * File: cli-errors.ts
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
 * Format compatibility failures for the 1Password CLI boundary.
 *
 * @module
 * @since 0.1.0
 */

import type { CliFormat } from "@resnovas/opp-onepassword-contract"
import type { CliEncodableError } from "./errors.js"

const unsupportedHuman = (error: {
  readonly command: string
  readonly feature: string
  readonly limitation: string
  readonly suggestion?: string
}): string => {
  const lines = [
    `[ERROR] ${error.command} is not supported.`,
    `1Password ${error.feature} has no equivalent in Proton Pass.`,
    error.limitation,
    ...(error.suggestion === undefined ? [] : [error.suggestion])
  ]
  return lines.join("\n")
}

const unsupportedJson = (error: {
  readonly command: string
  readonly feature: string
  readonly limitation: string
}): string =>
  JSON.stringify({
    code: "unsupported",
    command: error.command,
    feature: error.feature,
    message: error.limitation
  })

/**
 * Format a compatibility error for stderr in human or JSON CLI mode.
 *
 * @remarks
 * Human mode follows the documented multi-line `[ERROR]` pattern. JSON mode
 * emits a small object when 1Password does not define one for the command.
 * Never includes secret material. Pure and never throws.
 *
 * @param error - the failure to format
 * @param format - the requested CLI output format
 * @returns text suitable for stderr
 *
 * @category utils
 * @since 0.1.0
 *
 * @example
 * import { formatCliError } from "@resnovas/opp-onepassword-compat"
 * import { CliUnsupported } from "@resnovas/opp-onepassword-compat"
 *
 * const human = formatCliError(
 *   new CliUnsupported({
 *     command: "op document create",
 *     feature: "documents",
 *     limitation: "Proton Pass stores notes and SSH keys instead."
 *   }),
 *   "human"
 * )
 *
 * assert.match(human, /\[ERROR\] op document create is not supported\./)
 */
export const formatCliError = (error: CliEncodableError, format: CliFormat): string => {
  switch (error._tag) {
    case "CliUnsupported":
      return format === "json" ? unsupportedJson(error) : unsupportedHuman(error)
    case "ConnectUnsupported":
      return format === "json"
        ? JSON.stringify({
            code: "unsupported",
            operation: error.operation,
            feature: error.feature,
            message: error.limitation
          })
        : unsupportedHuman({
            command: error.operation,
            feature: error.feature,
            limitation: error.limitation
          })
    case "CliExit":
      return format === "json"
        ? JSON.stringify({
            code: "exit",
            exitCode: error.exitCode,
            command: error.command,
            message: error.stderr.trim()
          })
        : `[ERROR] ${error.command} exited ${error.exitCode}: ${error.stderr.trim()}`
    case "AuthError":
      return format === "json"
        ? JSON.stringify({ code: "auth", message: error.reason })
        : `[ERROR] ${error.reason}`
    case "VaultError":
      return format === "json"
        ? JSON.stringify({ code: "vault", message: error.reason })
        : `[ERROR] ${error.reason}`
    case "ItemError":
      return format === "json"
        ? JSON.stringify({ code: "item", message: error.reason })
        : `[ERROR] ${error.reason}`
    default: {
      const unreachable: never = error
      return unreachable
    }
  }
}
