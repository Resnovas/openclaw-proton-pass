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
