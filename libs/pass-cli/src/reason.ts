/*
 * Project: openclaw-proton-pass
 * File: reason.ts
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
 * The sentence Proton records against every audited vault read.
 *
 * An agent token refuses an audited read unless a reason is supplied, and
 * that reason is the only thing `pass-cli agent monitor` shows about why a
 * credential was taken. A constant string satisfies the requirement and
 * wastes it: every entry looks the same, so the log can prove that a read
 * happened and nothing about which one it was. This builds a sentence from
 * what the calling binary actually knows.
 *
 * @module
 * @since 0.1.0
 */

import type { Binary } from "@resnovas/opp-telemetry"

/**
 * The longest reason Proton Pass accepts.
 *
 * @category constants
 * @since 0.1.0
 */
export const MAX_REASON_LENGTH = 300

/** How many ids are named before the rest are counted instead. */
const MAX_NAMED_IDS = 5

/**
 * Why a binary is reaching for a credential.
 *
 * @category models
 * @since 0.1.0
 */
export interface AccessPurpose {
  /** Which of the four executables is asking. */
  readonly binary: Binary
  /**
   * What the credential is being used for, in the caller's own terms: the
   * proxy route it is about to be attached to, or the command that is about
   * to be launched with it. Omitted by a caller that has nothing to add,
   * which is the Gateway asking the resolver for a batch of ids.
   */
  readonly target?: string | undefined
}

/**
 * What this deployment can say about itself.
 *
 * Both fields are absent unless an operator sets them. OpenClaw tells an
 * exec secret provider nothing about the agent, session or task behind a
 * request: the protocol carries a version, a provider name and a list of
 * ids, and the provider runs with a filtered environment. So the only way
 * an agent or task name can reach the audit log is if the operator puts it
 * somewhere this can read.
 *
 * @category models
 * @since 0.1.0
 */
export interface AuditContext {
  /** Free text from `OPENCLAW_PROTONPASS_AUDIT_LABEL`. */
  readonly label?: string | undefined
  /** The OpenClaw profile, from `OPENCLAW_PROFILE`, when the host sets it. */
  readonly profile?: string | undefined
}

/**
 * Reduce a fragment to something safe to put in an audit entry.
 *
 * Control characters are removed rather than escaped, because the reason is
 * carried in an environment variable and read back in a web interface, and
 * neither has a use for a newline in the middle of a sentence.
 */
const clean = (value: string): string =>
  value
    .replace(/[\u0000-\u001F\u007F]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()

/**
 * Compose the reason recorded against one audited vault read.
 *
 * @remarks
 * Pure and total. Never returns the empty string, because an agent token
 * refuses a read whose reason is empty, and never exceeds
 * {@link MAX_REASON_LENGTH}, because Proton rejects a longer one; a sentence
 * that would run over is truncated rather than dropped, so the most specific
 * part survives.
 *
 * Only names travel. The ids are the keys of the secret map, which the
 * security model already treats as non-secret, and the target is a route
 * path or a command name taken from configuration. A resolved value and the
 * `pass://` reference it came from are both deliberately absent: Proton
 * knows which item it served without being told, and an audit entry is a
 * poor place to restate it.
 *
 * @param purpose - which binary is asking, and what for
 * @param names - what is being read: secret map ids, or the environment
 * variable names holding the references, whichever the caller knows
 * @param context - what the operator has said about this deployment
 * @returns the sentence to put in `PROTON_PASS_AGENT_REASON`
 *
 * @example
 * import { auditReason } from "@resnovas/opp-pass-cli"
 *
 * assert.strictEqual(
 *   auditReason(
 *     { binary: "mcp-auth-proxy", target: "route /context7" },
 *     ["CONTEXT7_MCP_AUTHORIZATION"],
 *     {}
 *   ),
 *   "OpenClaw mcp-auth-proxy reading CONTEXT7_MCP_AUTHORIZATION for route /context7"
 * )
 *
 * // A batch from the Gateway, which knows no more than the ids.
 * assert.strictEqual(
 *   auditReason({ binary: "resolver" }, ["OPENAI_API_KEY", "DISCORD_BOT_TOKEN"], {}),
 *   "OpenClaw resolver reading OPENAI_API_KEY, DISCORD_BOT_TOKEN"
 * )
 */
export const auditReason = (
  purpose: AccessPurpose,
  names: ReadonlyArray<string>,
  context: AuditContext
): string => {
  const named = names.slice(0, MAX_NAMED_IDS).map(clean).filter((id) => id !== "")
  const unnamed = names.length - named.length
  const subject =
    named.length === 0
      ? "a secret"
      : unnamed > 0
        ? `${named.join(", ")} and ${unnamed} more`
        : named.join(", ")

  const sentence = [`OpenClaw ${purpose.binary} reading ${subject}`]

  const target = clean(purpose.target ?? "")
  if (target !== "") sentence.push(`for ${target}`)

  const notes: Array<string> = []
  const label = clean(context.label ?? "")
  if (label !== "") notes.push(label)
  const profile = clean(context.profile ?? "")
  if (profile !== "") notes.push(`profile ${profile}`)
  if (notes.length > 0) sentence.push(`(${notes.join("; ")})`)

  const reason = sentence.join(" ")
  return reason.length <= MAX_REASON_LENGTH
    ? reason
    : `${reason.slice(0, MAX_REASON_LENGTH - 3).trimEnd()}...`
}
