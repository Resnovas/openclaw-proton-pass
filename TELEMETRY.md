# Telemetry

This tool reports how it is working. It is **on by default**, and it is built so
that it cannot report a secret even if someone tries to make it.

Opting out is one environment variable:

```bash
OPENCLAW_PROTONPASS_TELEMETRY=false
```

> **The full explanation is in the documentation site**, at
> [`docs/security/telemetry.mdx`](docs/security/telemetry.mdx). It covers the
> same ground twice — once in plain language, once precisely — along with what
> is collected, what can never be collected, and how both are tested. This page
> is the summary, kept short so that the two cannot drift.

## Why a credential tool can default to reporting

Every event this system can send is a member of a closed union declared in
`libs/telemetry/src/events.ts`. Its fields are numbers, booleans, and unions of
string literals written in that file. **There is no field of type `string`
anywhere in the union.**

A secret is a runtime string of unknown content, so there is no field it can be
assigned to. The compiler checks this, which makes a violation a build failure
rather than a bug.

Behind that, one function builds every property object, and it filters on the
**value**: a finite number or a boolean passes, a string passes only if it
appears verbatim in a list of literals declared in this codebase, and anything
else is dropped. Filtering by value rather than by field name is the point — a
name-based denylist only blocks the names someone thought of, and is defeated
by putting a secret under an innocuous key.

Errors travel as their tag, never as their message, with the stack reduced to
file basenames.

## What is collected

Counts, durations, exit codes, HTTP statuses, flags, and tags from fixed lists:
which binary ran, how many secrets were requested and resolved, how long it
took, whether a vault session was reused or rebuilt, which diagnostic occurred,
which span completed, which error tag was raised.

Reports are attributed to a random install id stored at
`~/.config/proton-pass-cli/install-id`, alongside a description of the machine —
OS, architecture, Node, npm, pnpm and `pass-cli` versions, CPU count, memory,
timezone, and hostname — so a failure can be correlated with what it runs on.

**`hostname` identifies a machine, and on a personal device often a person.** If
that is not a trade you want on a particular install, turn telemetry off there.

## What can never be collected

Secret values. Vault references. Filesystem paths. Upstream hosts and URLs.
Secret ids. Environment variables. Log message text. Error message text.
Command arguments. Anything typed by a person.

Not "is filtered out" — has no field to travel in.

## Pointing it elsewhere

```bash
OPENCLAW_PROTONPASS_POSTHOG_KEY=phc_your_own   # report to your own project
OPENCLAW_PROTONPASS_POSTHOG_KEY=""             # enabled, but send nowhere
OPENCLAW_PROTONPASS_POSTHOG_HOST=https://us.i.posthog.com
OPENCLAW_PROTONPASS_SERVICE_NAME=my-service
OPENCLAW_PROTONPASS_ENVIRONMENT=staging
```

The build carries a PostHog project API key: a write-only ingestion key of the
kind designed to ship inside clients, which can send events and read nothing
back.

Reporting never affects behaviour. Every capture is ignored on failure, so an
unreachable analytics backend cannot fail a secret resolution.
