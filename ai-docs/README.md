# AI docs

`LLMS.md` at the repository root is generated from `ai-docs/src`.

It exists so an agent working on this codebase can read one file and know how
the pieces fit, rather than inferring it from documentation written for people.
The conventions follow
[Effect's own `ai-docs`](https://github.com/Effect-TS/effect/tree/main/ai-docs),
because the approach is theirs; `@effect/ai-docgen` is unpublished, so the
generator is reimplemented in `scripts/ai-docgen.ts`.

## Add content

1. Add or update the markdown in `ai-docs/src/**/index.md` for section text.
2. Add examples as `.ts` files in the same folder.
3. Run `pnpm ai-docgen` to regenerate `LLMS.md`.

## Source file conventions

- Numeric filename prefixes control ordering (`10_`, `20_`). Avoid a leading
  zero.
- A leading JSDoc block with `@title` and an optional description controls how
  an example is rendered. The block itself is not included in the snippet.
- `fixtures` directories are supporting code and are not rendered. Use them for
  anything an example needs but a reader does not.

## Example guidelines

Read the existing examples before adding one, and read the current `LLMS.md` to
see the resulting style.

**Examples are compiled.** They are ordinary TypeScript in a project `pnpm
check` builds, so an example that stops compiling fails the build. That is the
whole reason for generating this file rather than writing it: guidance that
drifts from the code is worse than no guidance, because an agent will act on it.

**Comment the why, not the what.** The goal is to teach how this system is meant
to be used, and the non-obvious parts here are all about *why* a thing is done a
particular way — why a value stays redacted, why an event has no string field.

**Show real usage.** Prefer the service style used throughout the codebase over
a toy snippet that would not survive contact with the real layers.

## Regeneration

```bash
pnpm ai-docgen          # regenerate LLMS.md
pnpm ai-docgen:check    # fail if it is out of date
```

`pnpm verify` runs the check, so `LLMS.md` cannot drift from its sources.
