/*
 * Project: openclaw-proton-pass
 * File: process.ts
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

import { Readable } from "node:stream"

/** Replace process.stdin with a readable carrying `input`, and restore after. */
export const withStdin = async <A>(input: string, run: () => Promise<A>): Promise<A> => {
  const original = Object.getOwnPropertyDescriptor(process, "stdin")
  Object.defineProperty(process, "stdin", {
    value: Readable.from([Buffer.from(input)]),
    configurable: true
  })
  try {
    return await run()
  } finally {
    if (original !== undefined) Object.defineProperty(process, "stdin", original)
  }
}

/** Replace process.stdin with a stream that errors, to exercise the read failure. */
export const withFailingStdin = async <A>(run: () => Promise<A>): Promise<A> => {
  const original = Object.getOwnPropertyDescriptor(process, "stdin")
  const broken = new Readable({
    read() {
      this.destroy(new Error("stdin exploded"))
    }
  })
  Object.defineProperty(process, "stdin", { value: broken, configurable: true })
  try {
    return await run()
  } finally {
    if (original !== undefined) Object.defineProperty(process, "stdin", original)
  }
}

/** Capture everything written to stdout while `run` executes. */
export const captureStdout = async <A>(
  run: () => Promise<A>
): Promise<{ result: A; output: string }> => {
  const original = process.stdout.write.bind(process.stdout)
  let output = ""
  process.stdout.write = ((chunk: string | Uint8Array) => {
    output += String(chunk)
    return true
  }) as typeof process.stdout.write
  try {
    const result = await run()
    return { result, output }
  } finally {
    process.stdout.write = original
  }
}

/** Run with a replaced argv, restoring it afterwards. */
export const withArgv = async <A>(
  argv: ReadonlyArray<string>,
  run: () => Promise<A>
): Promise<A> => {
  const original = process.argv
  process.argv = ["node", "entry", ...argv]
  try {
    return await run()
  } finally {
    process.argv = original
  }
}

/** Record and reset process.exitCode around a run. */
export const withExitCode = async <A>(
  run: () => Promise<A>
): Promise<{ result: A; exitCode: number | string | undefined }> => {
  const original = process.exitCode
  process.exitCode = undefined
  try {
    const result = await run()
    return { result, exitCode: process.exitCode }
  } finally {
    process.exitCode = original
  }
}
