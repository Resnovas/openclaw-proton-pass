/*
 * Project: openclaw-proton-pass
 * File: 10_decode-a-map.ts
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

/**
 * @title Decoding a secret map
 *
 * Both entry shapes decode into the same normalised form, so nothing
 * downstream has to branch on which one the operator happened to write.
 */
import { decorate, normaliseEntry, SecretId, SecretMap } from "@resnovas/opp-domain"
import { Effect, Schema } from "effect"

// Decoding is the only way to obtain a branded `PassRef`. There is no cast
// anywhere in this codebase that produces one, which is what stops a resolved
// value being accepted where a reference belongs.
const decodeMap = Schema.decodeUnknown(SecretMap)

// The map is keyed by `SecretId`, not by `string`, so even looking an entry up
// means having decoded the id first. A typo cannot reach the vault.
const decodeId = Schema.decodeUnknownSync(SecretId)

export const example = Effect.gen(function* () {
  const map = yield* decodeMap({
    // The bare form: the value is used exactly as the vault returns it.
    CONTEXT7_API_KEY: "pass://OpenClaw/context7.com/API Key",
    // The decorated form: the same vault item, wrapped for an HTTP header.
    // One entry in the vault, so there is only one thing to rotate.
    CONTEXT7_MCP_AUTHORIZATION: {
      ref: "pass://OpenClaw/context7.com/API Key",
      prefix: "Bearer "
    }
  })

  const header = map[decodeId("CONTEXT7_MCP_AUTHORIZATION")]
  if (header === undefined) return

  // `normaliseEntry` flattens both shapes; `prefix` and `suffix` default to
  // empty, so a bare reference and a decorated one have the same shape here.
  const { ref, prefix } = normaliseEntry(header)
  yield* Effect.logInfo(`${ref} is wrapped with ${JSON.stringify(prefix)}`)

  // Decoration is applied to the resolved value, inside the redacted boundary,
  // so the prefix never exists as a separate string beside the credential.
  return decorate(header, "the-value-the-vault-returned")
})
