# Contributing

Thanks for considering a contribution.

## Before you open an issue

Run the doctor and include its output — it reports what is installed, what is
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
