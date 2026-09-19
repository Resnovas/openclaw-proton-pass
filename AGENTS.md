# Agent guide

Read [`LLMS.md`](./LLMS.md) first. It is generated from `ai-docs/src` and is
the shortest path to understanding how this codebase fits together, with
examples the compiler checks.

## Where things are

| Path | What it is |
| --- | --- |
| `libs/*` | Reusable contracts: domain types, configuration, the Proton Pass services, telemetry |
| `apps/*` | The four executables |
| `tests/` | Mirrors the source tree |
| `docs/` | The Docs7 documentation site. `docs/reference/api/**` is generated |
| `ai-docs/` | The sources for `LLMS.md`. Examples here are compiled |
| `.agents/agent-patterns/` | Practical references for the libraries this project uses |

## Before you change anything

Three rules explain most of the design. Breaking one is not a style
disagreement; each has caused a real bug already.

1. **stdout is the protocol.** Log to stderr, always.
2. **A secret stays `Redacted`** until the protocol response, the child
   environment, or the outbound header. `Redacted.value` anywhere else is a bug.
3. **Telemetry has no field a secret could occupy.** No field of type `string`
   in the event union.

## The gate

```bash
pnpm verify
```

Typecheck, licence headers, API contracts against `dist/**/*.d.ts`, the suite at
100% coverage, a coverage-depth report, the generated API reference, and
`LLMS.md`. Run it before saying something works.

Individually:

```bash
pnpm check            # typecheck every project
pnpm test             # the suite
pnpm lint:headers     # every file carries the FCL-1.0-MIT header
pnpm lint:contracts   # every exported callable's contract survives into dist
pnpm docs:api         # regenerate docs/reference/api from JSDoc
pnpm ai-docgen        # regenerate LLMS.md from ai-docs/src
pnpm docs:dev         # preview the site with Mintlify (port 3333)
pnpm docs:dev:docs7   # preview the same source with Docs7 (port 3334)
```

## Documentation is generated, and checked

Do not hand-edit `docs/reference/api/**` or `LLMS.md`. Edit the JSDoc, or the
files under `ai-docs/src`, and regenerate. `pnpm verify` fails if either is out
of date.

Every `@example` in a JSDoc block is **compiled and executed** by
`@effect/docgen`, so an example that stops being true fails the build. Write
examples that assert something worth asserting.

Every exported callable must carry `@remarks` describing contract behaviour, a
typed `@example`, `@param` for each parameter, and `@returns` unless it returns
nothing. This is enforced against the declaration output, because that is what
a consumer - or an agent generating tests - actually reads.

## Standards

- **TypeScript with Effect v3.** No `any`: prefer `unknown` with a type guard,
  or a narrow generic, and document any escape hatch.
- **No tacit calls.** `Effect.map((x) => fn(x))`, not `Effect.map(fn)`.
- **`runMain` is the entry point** for every executable; teardown belongs in
  the main effect so interruption releases resources.
- **Services use `Effect.Service`** and compose with layers.
- **PNPM**, and Nx for the project graph.
- **No existing test is ever deleted.** If code fails a test, fix the code.

## Version control

This repository uses GitButler (`but`), not raw `git` write commands. Commit
messages follow `type(scope): summary`.

## Do not

- Put a credential, a vault reference, or a personal service in code, tests,
  comments or documentation. Examples use
  [Context7](https://github.com/upstash/context7), which is free, open source
  and publicly usable.
- Write a log line to stdout.
- Add a `string` field to the telemetry event union.
- Widen `ListenAddress` beyond loopback.
