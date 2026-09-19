/*
 * Project: openclaw-proton-pass
 * File: agent-token.ts
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
 * Where the Proton Pass agent token comes from.
 *
 * Two sources, because two deployments need different things. A workstation
 * wants a file: it survives a reboot and is not visible to anything that
 * inspects the process. A container or a managed host wants an environment
 * variable: the platform already has a place to put a secret, and writing one
 * to a file inside an ephemeral filesystem during provisioning is work that
 * buys nothing.
 *
 * @module
 * @since 0.1.0
 */

import { Config, Effect, Option, Redacted } from "effect"

/**
 * The agent token supplied through the environment, if one was.
 *
 * Read as `Redacted` from the moment it leaves the environment, so it cannot
 * reach a log line by being interpolated into one.
 *
 * The variable is read rather than the file whenever it is set, because an
 * operator who exports it is stating an intent that a leftover file on the
 * same host should not override. A value that is empty or whitespace is
 * treated as absent: an unset variable and one exported as the empty string
 * mean the same thing to everyone except a string comparison, and an empty
 * token would otherwise be sent to the vault as a login attempt that fails
 * with an authentication error pointing nowhere useful.
 *
 * Exposed as an Effect that cannot fail rather than as a `Config`, because
 * the caller is on the session bootstrap path, whose error channel is the
 * project's closed domain union. Letting a `ConfigError` through would widen
 * that union at every handling site to describe a condition that only means
 * "no variable was set", which this already reports as `None`.
 *
 * @category config
 * @since 0.1.0
 *
 * @example
 * import { agentTokenFromEnvironment } from "@resnovas/opp-config"
 * import { ConfigProvider, Effect, Option, Redacted } from "effect"
 *
 * const read = (env: Record<string, string>) =>
 *   Effect.runSync(
 *     agentTokenFromEnvironment.pipe(
 *       Effect.withConfigProvider(ConfigProvider.fromMap(new Map(Object.entries(env))))
 *     )
 *   )
 *
 * assert.strictEqual(Option.isNone(read({})), true)
 * assert.strictEqual(Option.isNone(read({ OPENCLAW_PROTONPASS_AGENT_TOKEN: "  " })), true)
 *
 * const supplied = read({ OPENCLAW_PROTONPASS_AGENT_TOKEN: " pat_abc " })
 *
 * // Trimmed, because a variable set from a file or a command substitution
 * // commonly carries the newline the writer left behind.
 * assert.strictEqual(
 *   Option.isSome(supplied) && Redacted.value(supplied.value),
 *   "pat_abc"
 * )
 */
export const agentTokenFromEnvironment: Effect.Effect<
  Option.Option<Redacted.Redacted<string>>
> = Config.string("OPENCLAW_PROTONPASS_AGENT_TOKEN").pipe(
  Config.map((value) => value.trim()),
  Config.option,
  Config.map(
    Option.flatMap((value) =>
      value === "" ? Option.none() : Option.some(Redacted.make(value))
    )
  ),
  Effect.orElseSucceed(() => Option.none<Redacted.Redacted<string>>())
)
