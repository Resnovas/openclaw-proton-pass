/*
 * Project: openclaw-proton-pass
 * File: unsupported.ts
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
 * Fail with a formatted {@link CliUnsupported} error on stderr.
 *
 * @module
 * @since 0.1.0
 */

import {
  CliUnsupported,
  formatCliError
} from "@resnovas/opp-onepassword-compat"
import type { CliFormat } from "@resnovas/opp-onepassword-contract"
import { Effect } from "effect"

/**
 * Parameters for an unsupported 1Password CLI command.
 *
 * @category models
 * @since 0.1.0
 */
export interface UnsupportedParams {
  readonly command: string
  readonly feature: string
  readonly limitation: string
  readonly suggestion?: string
}

/**
 * Report that a 1Password CLI command is not supported and fail.
 *
 * @remarks
 * Writes a formatted message to stderr via {@link formatCliError}, sets
 * `process.exitCode` to `1`, and fails with {@link CliUnsupported}. Never
 * writes secret material.
 *
 * @param params - unsupported command metadata
 * @param format - requested CLI output format
 * @returns an Effect that always fails with {@link CliUnsupported}
 *
 * @category utils
 * @since 0.1.0
 */
export const failUnsupported = (
  params: UnsupportedParams,
  format: CliFormat
): Effect.Effect<never, CliUnsupported> =>
  Effect.gen(function* () {
    const error = new CliUnsupported({
      command: params.command,
      feature: params.feature,
      limitation: params.limitation,
      ...(params.suggestion === undefined ? {} : { suggestion: params.suggestion })
    })
    const message = formatCliError(error, format)
    yield* Effect.sync(() => {
      process.stderr.write(`${message}\n`)
      process.exitCode = 1
    })
    return yield* Effect.fail(error)
  })
