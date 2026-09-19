<!--
  Generated from ai-docs/src by scripts/ai-docgen.ts. Do not edit by hand:
  edit the sources and run `pnpm ai-docgen`.
-->

# openclaw-proton-pass for agents

Guidance for an agent working on or with this codebase, assembled into one
file so it can be read in a single pass. Every example below is a real file
under `ai-docs/src`, compiled by `pnpm check`.

For the human-facing documentation, see the `docs/` site. For the generated
API reference, see `docs/reference/api`.

---

## What this system is

A secret provider for [OpenClaw](https://openclaw.ai), backed by a
[Proton Pass](https://proton.me/pass) vault. OpenClaw holds a reference; this
resolves it to a value at the moment it is needed, so no credential is written
into a configuration file.

There are four executables because OpenClaw accepts a secret in three places
with three different rules, plus a management CLI:

| Executable | Role |
| --- | --- |
| `openclaw-protonpass-resolver` | The `exec` secret provider. One JSON request on stdin, one response on stdout. |
| `openclaw-pass-run` | Launches a stdio MCP server with `pass://` environment references resolved. |
| `openclaw-mcp-auth-proxy` | A loopback HTTP hop that attaches a credential header to remote MCP requests. |
| `openclaw-proton-pass` | `setup`, `token` and `doctor`. |

## Layout

```
libs/domain        branded types, schemas, the error union - no I/O
libs/config        Effect Config: every path, with an environment override
libs/pass-cli      PassSession and SecretResolver
libs/telemetry     the closed event union and its filters
apps/*             the four executables
tests/             mirrors the source tree
docs/              the Docs7 documentation site
ai-docs/           the sources for LLMS.md
```

Nx infers the project graph from imports, so build order follows the graph. Run
`pnpm verify` before claiming anything works: it typechecks, checks licence
headers and API contracts, runs the suite at 100% coverage with a depth report,
and regenerates the API reference - which compiles and executes every
documentation example.

## Four rules that explain most of the code

Read these before changing anything; each one is load-bearing and each has been
violated before, with consequences recorded in the commit history.

1. **stdout is the protocol.** The resolver writes its JSON response there and
   the proxy streams payloads through it. Every log line in every executable
   goes to stderr. A single log line on stdout corrupts what the Gateway parses.

2. **A secret is `Redacted` until the boundary that needs it.** There are four
   such boundaries: the protocol response, the child process environment, the
   outbound HTTP header, and the environment handed to `pass-cli login`.
   Anywhere else, `Redacted.value` is a bug. A secret never becomes a
   command-line argument, because a process's arguments are readable by every
   other process on the host.

3. **Telemetry has no field a secret could occupy.** The event union has no
   field of type `string` - only numbers, booleans, and string literal unions.
   Adding one would not be a policy violation to be reviewed; it would be a
   change to the thing that makes the guarantee true.

4. **No module branches on the operating system except `libs/config/host.ts`.**
   Every host difference is a pure function there of the platform name and the
   environment, which is what makes each one testable from a machine that is
   not that host. Reaching for `process.platform` anywhere else, or assuming
   `HOME`, `chmod` or systemd, is the class of bug this file exists to
   prevent: the four executables run on Linux, macOS, Windows and in
   containers with no init system.

---

## Secrets: ids, references and values

Three kinds of string that must never be confused, which is why two of them are
branded.

| | Example | Written where |
| --- | --- | --- |
| **Id** | `CONTEXT7_API_KEY` | `openclaw.json` and the secret map |
| **Reference** | `pass://OpenClaw/context7.com/API Key` | the secret map, and nowhere else |
| **Value** | the credential | nowhere on disk |

An id is opaque on purpose: the map is the only place a vault location appears,
so moving an item between vaults is a one-file edit rather than a configuration
migration.

`SecretId` and `PassRef` are branded schemas. Construct them by decoding, never
by casting - a cast is how a resolved value ends up somewhere expecting a
reference.

One vault entry can serve two consumers through decoration: a bare credential
field wants the token alone, an `Authorization` header wants `Bearer ` in front
of it. Two vault entries would have to be rotated together, and eventually would
not be.

### decode-a-map

```ts
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
```

### resolve-a-secret

```ts
/*
 * Project: openclaw-proton-pass
 * File: 20_resolve-a-secret.ts
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
 * @title Resolving a secret
 *
 * `SecretResolver` is the only thing that talks to the vault. It answers with
 * one outcome per requested id, in request order.
 */
import { SecretResolver } from "@resnovas/opp-pass-cli"
import { SecretId } from "@resnovas/opp-domain"
import { Effect, Redacted, Schema } from "effect"

const decodeId = Schema.decodeUnknownSync(SecretId)

export const example = Effect.gen(function* () {
  const resolver = yield* SecretResolver

  // One call resolves the whole batch. Resolution costs a `pass-cli`
  // invocation, so asking for several ids at once is meaningfully cheaper
  // than a call each.
  // The second argument is not optional. It becomes the reason recorded
  // against this read in the vault's audit log, and a read with no reason is
  // refused by an agent token, so there is no call that does not have to say
  // what it is for.
  const outcomes = yield* resolver.resolve(
    [decodeId("CONTEXT7_API_KEY"), decodeId("NOT_IN_THE_MAP")],
    { binary: "resolver" }
  )

  for (const [id, outcome] of outcomes) {
    if (outcome._tag === "NotFound") {
      // An unknown id and an empty vault field are reported identically, so
      // the provider cannot be used to discover which ids exist.
      yield* Effect.logWarning(`no value for ${id}`)
      continue
    }

    // `outcome.value` is `Redacted<string>`. Logging it prints `<redacted>`,
    // which is the point: only the boundary that needs the value unwraps it.
    yield* Effect.logInfo(`resolved ${id}: ${outcome.value}`)

    // Unwrap only where the value is genuinely required. In the resolver that
    // is the protocol response; in the proxy it is the outbound header.
    const _value: string = Redacted.value(outcome.value)
    void _value
  }
}).pipe(Effect.provide(SecretResolver.Default))
```

---

## Telemetry

Reporting is **on by default**, and the reason that is defensible for a tool
handling credentials is structural rather than procedural.

The event union in `libs/telemetry/src/events.ts` has no field of type
`string`. Fields are numbers, booleans, or unions of string literals declared
in that file. A secret is a runtime string of unknown content, so there is no
field it can be assigned to. The compiler enforces this, so a violation is a
build failure rather than a review comment someone might miss.

Behind that, `toProperties` filters on the **value**: a finite number or a
boolean passes, a string passes only if it appears verbatim in
`ALLOWED_VALUES`, and everything else is dropped. Filtering by value rather
than by name matters - a name-based denylist only blocks names someone thought
of, and is defeated by putting a secret under an innocuous key.

### If you are adding an event

1. Add it to the `TelemetryEvent` union. Use numbers, booleans and literal
   unions only.
2. Add any new literals to `ALLOWED_VALUES`, or they will be dropped at
   runtime even though they compile.
3. Do not add a field of type `string`. If you believe you need one, you are
   about to describe content rather than shape; describe the shape instead.

### Signals

Each goes to the PostHog product that displays it: analytics through `capture`,
metrics through the metrics client, tracing through `span`, logs over OTLP with
an id rather than a message, and errors through `captureError` by tag with a
stack reduced to basenames.

Reporting never affects behaviour - every capture is ignored on failure, so an
unreachable backend cannot fail a secret resolution.

### add-an-event

```ts
/*
 * Project: openclaw-proton-pass
 * File: 10_add-an-event.ts
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
 * @title Reporting an event
 *
 * Every field is a number, a boolean, or a string literal declared in the
 * event union. There is no field of type `string`, so a secret has nowhere to
 * go - this is the safety property, expressed as a type rather than a policy.
 */
import { Telemetry } from "@resnovas/opp-telemetry"
import { Effect } from "effect"

export const example = Effect.gen(function* () {
  const telemetry = yield* Telemetry

  // Counts and durations. `sessionOutcome` is one of three literals, so it
  // describes what happened without describing anything that happened *to*.
  yield* telemetry.capture({
    name: "provider_resolved",
    requested: 2,
    resolved: 1,
    missing: 1,
    decorated: 0,
    durationMs: 41,
    sessionOutcome: "reused"
  })

  // A diagnostic is an id from a fixed list plus a count. Log *messages* are
  // never transmitted, because this project's log lines routinely contain
  // filesystem paths.
  yield* telemetry.diagnostic("resolver.id_not_in_map", "warn")

  // A failure travels as its tag. The error itself is not forwarded: its
  // fields carry paths and its message is free text.
  yield* telemetry.captureError("SecretMapError")

  // Short-lived processes must flush, or the buffer is discarded on exit and
  // nothing is ever reported.
  yield* telemetry.flush
}).pipe(Effect.provide(Telemetry.Default))
```

### instrument-a-span

```ts
/*
 * Project: openclaw-proton-pass
 * File: 20_instrument-a-span.ts
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
 * @title Instrumenting an operation
 *
 * Span names are constants for the same reason event fields are: a span name
 * is transmitted, so it must not be derived from anything at runtime.
 */
import { Telemetry } from "@resnovas/opp-telemetry"
import { Effect } from "effect"

const work = Effect.succeed(3)

export const example = Effect.gen(function* () {
  const telemetry = yield* Telemetry

  // `span` wraps an effect and reports its duration and outcome. Adding a new
  // span means adding its name to the `SpanName` union first - which is the
  // compiler's way of asking whether the name is a constant.
  const count = yield* telemetry.span("resolver.load_map", work)

  return count
}).pipe(Effect.provide(Telemetry.Default))
```

---

## Failure

Seven tagged errors, one exhaustive union, declared in
`libs/domain/src/errors.ts`.

| Error | Raised when |
| --- | --- |
| `SecretMapError` | The map cannot be read or does not parse |
| `MissingAgentTokenError` | No agent token at the configured path |
| `SessionError` | No session could be established, even after a rebuild |
| `ResolutionError` | `pass-cli` exited non-zero while resolving |
| `ProtocolError` | The request on stdin is not well formed |
| `RouteConfigError` | The proxy's route file cannot be read or does not parse |
| `ProxyIoError` | The proxy cannot read a body or bind its listener |

Every member is a `Data.TaggedError`. That is not stylistic: `Data.TaggedError`
extends `Error`, so one untagged member widens the whole union to `Error` and
every `catchTag` in the codebase stops narrowing. If you add a failure mode,
tag it.

### Partial failure is not failure

The resolver reports per-id failures inside an otherwise successful response,
because one unknown id must not deny the Gateway the rest of the batch. A
top-level `error` means nothing could be produced at all.

There is exactly one per-id reason, `NOT_FOUND`. "Absent from the map" and "the
vault holds nothing there" are answered identically, so the provider cannot be
used to enumerate which ids exist. Do not add a second reason without
considering that.

### Errors carry the path, telemetry carries the tag

A domain error names the file it failed on, because an operator needs to know
which of three configuration files to look at. That same field is why the error
itself is never forwarded to error tracking - only its tag, with a stack
reduced to basenames.

### handle-failures

```ts
/*
 * Project: openclaw-proton-pass
 * File: 10_handle-failures.ts
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
 * @title Handling failure
 *
 * Every failure is a tagged member of one exhaustive union, so a handler can
 * match without a default branch and adding a member is a compiler-enforced
 * change at every handling site.
 */
import { SecretId } from "@resnovas/opp-domain"
import { SecretResolver, type Resolved } from "@resnovas/opp-pass-cli"
import { Effect, Schema } from "effect"

const decodeId = Schema.decodeUnknownSync(SecretId)

/** Nothing resolved, because the vault could not be asked. */
const nothing = new Map<SecretId, Resolved>()

export const example = Effect.gen(function* () {
  const resolver = yield* SecretResolver

  // The compiler knows exactly which of the seven failures `resolve` can
  // produce, so handling one it cannot produce is a type error rather than
  // dead code nobody notices. `loadMap` fails only with `SecretMapError`;
  // adding the other three tags to it would not compile.
  return yield* resolver
    .resolve([decodeId("CONTEXT7_API_KEY")], { binary: "resolver" })
    .pipe(
    // Each tag names the file to look at, because the error carries the path
    // rather than leaving an operator to guess between three of them.
    Effect.catchTag("SecretMapError", (cause) =>
      Effect.logError(`${cause.path}: ${cause.reason}`).pipe(Effect.as(nothing))
    ),
    Effect.catchTag("MissingAgentTokenError", (cause) =>
      Effect.logError(`no agent token at ${cause.path}`).pipe(Effect.as(nothing))
    ),
    Effect.catchTag("SessionError", (cause) =>
      Effect.logError(`no vault session: ${cause.reason}`).pipe(Effect.as(nothing))
    ),
    Effect.catchTag("ResolutionError", (cause) =>
      Effect.logError(`the vault call failed: ${cause.reason}`).pipe(Effect.as(nothing))
    )
  )
}).pipe(Effect.provide(SecretResolver.Default))
```

---

## Documentation

Three generated artefacts, each with a check that stops it drifting.

| Artefact | Source | Regenerate | Checked by |
| --- | --- | --- | --- |
| `docs/reference/api/**` | JSDoc in `libs/*/src` and `apps/*/src` | `pnpm docs:api` | `pnpm docs:check` |
| `LLMS.md` | `ai-docs/src` | `pnpm ai-docgen` | `pnpm ai-docgen:check` |
| declaration contracts | the same JSDoc | - | `pnpm lint:contracts` |

All three run inside `pnpm verify`. Do not edit a generated file; edit its
source and regenerate.

### Documentation examples are tests

An `@example` in a JSDoc block is compiled with the project's compiler options
and then **executed**, with Node's `assert` available. An example that stops
being true fails the build.

This is what `@effect/docgen` provides, and it is why examples here can be
trusted. `@effect/doctest` - the sibling tool that also runs examples out of
Markdown - is published only for Effect 4 and requires Effect 4 and Vitest 5 as
peers, so it cannot be used while this workspace is on Effect 3.

When adding an example, prefer one that demonstrates a property worth
asserting. `assert.throws` on a rejected input teaches more than a happy path.

### The contract every exported callable must carry

Enforced against `dist/**/*.d.ts`, because a contract only helps a consumer if
it survives into the declaration output:

- `@remarks` stating contract behaviour - totality, failure modes, what the
  caller may rely on. Not a restatement of the description.
- a typed `@example`
- `@param` for every parameter
- `@returns`, unless it returns nothing

`@category` and `@since` additionally group and version the export on its
generated page.

### The human-facing site

`docs/` is one source rendered by two engines. `docs.json` follows the format
Mintlify established and Docs7 implements, so both read the same tree.

- `pnpm docs:dev` previews with Mintlify on port 3333. It is the local default
  because it implements the page context menu, which Docs7 has not yet.
- `pnpm docs:dev:docs7` previews with Docs7 on port 3334. Docs7 is what gets
  published: it serves `llms.txt`, `llms-full.txt` and a `.md` form of every
  page, and feeds the Context7 integration.

Write for both. Docs7-only components have no Mintlify equivalent, and Mintlify
raises `missingMdxReference` and drops the block rather than degrading. That is
why agent-directed notes use a collapsed `Accordion` titled `Notes for AI
agents` rather than Docs7's `Visibility`: an accordion renders in both, stays
out of a reader's way, and still reaches agents through the page's Markdown.

Prose pages are written by hand; everything under `docs/reference/api` is not.
