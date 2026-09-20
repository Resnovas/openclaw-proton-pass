/*
 * Project: openclaw-proton-pass
 * File: cli.ts
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
 * Shared types for invoking and interpreting the 1Password CLI.
 *
 * These contracts describe stdout shape and failure modes without spawning
 * processes or reading the filesystem.
 *
 * @module
 * @since 0.1.0
 */

import { Data, Schema } from "effect"

/**
 * Human-readable CLI output, the default when `--format` is omitted.
 *
 * @category constants
 * @since 0.1.0
 */
export const CLI_FORMAT_HUMAN = "human" as const

/**
 * JSON CLI output, selected with `--format json`.
 *
 * @category constants
 * @since 0.1.0
 */
export const CLI_FORMAT_JSON = "json" as const

/**
 * The `--format` values accepted by the 1Password CLI.
 *
 * @category schemas
 * @since 0.1.0
 *
 * @example
 * import { CliFormat } from "@resnovas/opp-onepassword-contract"
 * import { Schema } from "effect"
 *
 * assert.strictEqual(Schema.decodeUnknownSync(CliFormat)("json"), "json")
 * assert.throws(() => Schema.decodeUnknownSync(CliFormat)("yaml"))
 */
export const CliFormat = Schema.Literal(CLI_FORMAT_HUMAN, CLI_FORMAT_JSON)

/**
 * The decoded form of {@link CliFormat}.
 *
 * @category models
 * @since 0.1.0
 */
export type CliFormat = typeof CliFormat.Type

/**
 * Raised when CLI stdout is not valid for the requested {@link CliFormat}.
 *
 * @category errors
 * @since 0.1.0
 */
export class CliParseError extends Data.TaggedError("CliParseError")<{
  readonly format: CliFormat
  readonly reason: string
}> {}

/**
 * Raised when the CLI exits non-zero.
 *
 * @category errors
 * @since 0.1.0
 */
export class CliExitError extends Data.TaggedError("CliExitError")<{
  readonly exitCode: number
  readonly stderr: string
}> {}

/**
 * Every failure mode a CLI adapter can surface.
 *
 * @category models
 * @since 0.1.0
 */
export type CliError = CliParseError | CliExitError

/**
 * Return a short label for a {@link CliError} tag.
 *
 * @remarks
 * Total over {@link CliError}: every member maps to its `_tag` string. Pure
 * and never throws.
 *
 * @param error - the CLI failure to label
 * @returns the tagged error name
 *
 * @category utils
 * @since 0.1.0
 *
 * @example
 * import { cliErrorTag, CliParseError } from "@resnovas/opp-onepassword-contract"
 *
 * assert.strictEqual(
 *   cliErrorTag(new CliParseError({ format: "json", reason: "unexpected token" })),
 *   "CliParseError"
 * )
 */
export const cliErrorTag = (error: CliError): CliError["_tag"] => {
  switch (error._tag) {
    case "CliParseError":
      return error._tag
    case "CliExitError":
      return error._tag
    default: {
      const unreachable: never = error
      return unreachable
    }
  }
}
