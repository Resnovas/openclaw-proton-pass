# Contributing

Thanks for considering a contribution.

## Before you open an issue

Run the doctor and include its output - it reports what is installed, what is
configured and what is missing, without revealing any secret:

```bash
openclaw-proton-pass doctor
```

Never paste a vault path, an agent token or a resolved value into an issue. The
id of a secret is fine; the reference and the value are not.

## Development

```bash
pnpm install
pnpm build      # nx run-many -t build
pnpm test       # @effect/vitest across the tests/ tree
pnpm verify     # typecheck, licence headers, tests
```

The workspace is Nx with `apps/*` and `libs/*`. Nx infers the project graph from
imports, so build order and affected commands follow the graph rather than the
package manager.

## Coding standards

- TypeScript only, with Effect-TS at the core. No `any`: prefer `unknown` with a
  type guard, or a narrow generic, and document any escape hatch.
- Avoid tacit (point-free) calls. `Effect.map((x) => fn(x))`, not `Effect.map(fn)`.
- `runMain` is the entry point for every executable; teardown belongs in the
  main effect so interruption releases resources.
- Secrets are carried as `Redacted` and unwrapped only at the boundary that
  genuinely needs the value.
- Services are defined with `Effect.Service` and composed with layers.
- Every exported callable carries a doc comment saying what it does and why.

## Tests

Tests live under `tests/<package-path>/src/**/*.spec.ts`, mirroring the source
tree, and use `@effect/vitest`. Cover success, failure and boundary cases.

**No existing test is ever deleted.** If code fails a test, fix the code. If
coverage is insufficient, add to the tests.

## Licence headers

Every source file carries the canonical FCL-1.0-MIT header. It is checked in CI:

```bash
pnpm lint:headers                                              # check
node --experimental-strip-types scripts/check-headers.ts --write  # apply
```

Only the `File` and `Last Modified` lines differ between files. The licence text
itself never varies.

## Releasing

Releases are automated. Run the **Release** workflow from the Actions tab,
optionally giving an explicit version; leaving it blank derives the bump from
conventional commits since the last tag.

The workflow runs `pnpm verify` before it tags anything, so a failing suite or a
missing licence header stops the release rather than shipping.

In order it: versions the package and writes `CHANGELOG.md`, commits and tags,
opens the GitHub release, publishes `@resnovas/openclaw-proton-pass` to npm with
provenance, attaches the bundled binaries to the release, then validates and
publishes the plugin to ClawHub.

Required repository secrets:

| Secret | Used for | Absent means |
| --- | --- | --- |
| `NPM_TOKEN` | npm publish (automation token with publish rights to `@resnovas`) | the publish step fails |
| `CLAWHUB_TOKEN` | ClawHub package publish | the publish step fails |
| `POSTHOG_CLI_API_KEY` | Source maps and the PostHog release. A **personal** API key with `error tracking write` and `organization read` | the upload step fails |
| `POSTHOG_PROJECT_ID` | The numeric PostHog project id | the upload step fails |
| `CONTEXT7_API_KEY` | Deploying the documentation site from the CLI | the step is skipped, which is correct when the site is connected to this repository from the Context7 teamspace |
| `LINEAR_ACCESS_KEY` | Recording the release in Linear. A **pipeline** access key from Settings, Releases; a personal API key will not work | the step is skipped |

`GITHUB_TOKEN` is provided by Actions and needs no configuration.

Tick **dry run** to rehearse the whole sequence without tagging, publishing or
pushing anything.
