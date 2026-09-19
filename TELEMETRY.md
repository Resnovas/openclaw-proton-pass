# Telemetry

This tool reports how it is working. It is **on by default**, and it is built so
that it cannot report a secret even if someone tries to make it.

Opting out is one environment variable:

```bash
OPENCLAW_PROTONPASS_TELEMETRY=false
```

This page explains how, twice: once in plain language, once precisely.

---

## The plain-language version

Imagine you want your plumber to know how the job went, but you do not want them
to know anything about what is inside your house.

So instead of giving them a blank notepad to write on, you give them a form that
has **already been printed**. The form has tick-boxes and number boxes:

```
How many taps did you check?      [  3  ]
How many were working?            [  2  ]
How long did it take (minutes)?   [ 14  ]
How did it go?                    [x] fine   [ ] broke
Which step went wrong?            [ ] step 1  [x] step 2  [ ] step 3
```

There is **nowhere on the form to write a sentence**. No blank lines. No margin.

That is the entire trick. A secret is a sentence — a long string of characters
nobody can predict. This form has no blank lines, so a secret has nowhere to go.
It is not that we look at each sentence and cross out the bad ones. It is that
you cannot write a sentence in the first place.

### "But what if someone adds a blank line to the form?"

Two things stop that.

**First**, the form is defined in one file, and the computer checks it. If a
programmer tries to add a blank line — a field that accepts any text — the code
will not compile. It is rejected before it can ever run.

**Second**, when the form is actually filled in and posted, one function reads
every box and asks: *is this a number, a yes/no, or one of the words printed on
the form?* If it is anything else, it rubs it out. So even if a blank line
somehow appeared, whatever was written in it would be erased on the way out.

### "What if someone hides a secret in a box that looks innocent?"

That is the important case, and it is the one this design handles best.

A weaker approach would be to look at the **labels**: cross out anything in a box
labelled "password" or "key". That fails immediately, because someone can put a
password in the box labelled "how many minutes".

So this does not check labels. It checks **what is written in the box**. A box is
only posted if what is in it is a number, a yes/no, or a word that was printed on
the form when it was designed. Your password is not one of the printed words, so
it is rubbed out — no matter which box it is in, and no matter what that box is
called.

### "If it collects so little, is it any use?"

Yes, because the useful part of a diagnosis is almost always the shape, not the
content.

"Three secrets asked for, one missing, took 21 milliseconds, the session had to
be rebuilt" tells you plenty — something is wrong with that install's
configuration, and its vault session is unstable. Knowing *which* secret, or
*what* it was, adds nothing to that diagnosis.

When something fails, the failure gets a **name** — `SecretMapError` — which is
one of the words printed on the form. You learn what broke. You do not learn
whose file it was or where it lived.

---

## The precise version

Three rules, enforced in different ways so that one failing does not expose you.

### Rule 1 — the event union is closed

Every event is a member of a union declared in `libs/telemetry/src/events.ts`.
Its fields are only:

- `number` — counts, durations, exit codes, status codes
- `boolean` — flags
- string literal unions — `"success" | "failure"`, `"SecretMapError" | ...`

There is no field of type `string` anywhere in the union. A secret is a runtime
string of unknown content, so there is no field it can be assigned to. This is
checked by the compiler, so a violation is a build failure, not a bug.

### Rule 2 — one choke point, filtering on values

`toProperties` in `libs/telemetry/src/payload.ts` is the only function that ever
builds a property object, and the only way to reach the analytics client. It
tests each **value**:

| Value | Result |
| --- | --- |
| Finite number | sent |
| Boolean | sent |
| String present verbatim in `ALLOWED_VALUES` | sent |
| Anything else | dropped |

`ALLOWED_VALUES` contains nothing but literals declared in this codebase.

Filtering by value rather than by name is the point. A name-based denylist can
only block names someone anticipated, and is defeated by putting a secret under
an innocuous key. A value allowlist fails the other way: an unanticipated field
is dropped rather than leaked. Membership is exact, not substring, so `success`
being permitted does not admit `success-token-abc123`.

### Rule 3 — errors travel as tags, never as text

Domain errors carry fields such as the path of an unreadable secret map, and an
error message is free text. So the original error is never forwarded. Only its
tag becomes the message, and the stack trace is reduced to file basenames, which
keeps the frames that locate the fault and discards the absolute paths that
identify the machine.

### Defence in depth

Behind the value allowlist, a name-based filter still removes properties whose
names suggest content — `secret`, `token`, `key`, `path`, `host`, `url`, and
similar. It is not the guarantee; it is a second net behind the first, costing
nothing. A test asserts it does not silently eat legitimate fields.

---

## Where each signal goes

Each signal is sent to the PostHog product that displays it, rather than all
being flattened into events:

| Signal | Transport | Appears in |
| --- | --- | --- |
| Product analytics | SDK `capture` | Events, insights |
| Metrics | SDK metrics client | Metrics |
| Tracing | SDK tracing client | Tracing |
| Logs | OTLP to `/i/v1/logs` | Logs |
| Error tracking | SDK `captureException` | Error tracking |

## Who the report is from

Reports are attributed to an **install id**: a random UUID generated on first
run and stored at `~/.config/proton-pass-cli/install-id`, mode `0600`.

It is random rather than derived from the machine, so it identifies an install
without encoding anything about it. Deleting the file starts a new identity. On
a filesystem where nothing can be written, a hash of stable machine attributes
stands in, so one host's runs still group together.

Alongside it, a description of the machine is sent once as person properties, so
a failure can be correlated with what it is running on:

| Field | Example |
| --- | --- |
| `hostname` | the machine's name |
| `os`, `os_release`, `arch` | `linux`, `7.2.4`, `x64` |
| `node_version`, `npm_version`, `pnpm_version` | `22.0.0`, `11.19.0`, `12.4.2` |
| `pass_cli_version` | `Proton Pass CLI 2.3.3` |
| `cpu_count`, `memory_gb` | `24`, `31.2` |
| `timezone`, `is_ci`, `installed_as_plugin` | `Europe/London`, `false`, `true` |
| `app_version` | the release this build came from |

These are free-form strings, unlike event properties. That is deliberate and the
distinction is the point: each is read from `node:os`, `process`, or a version
command, so none can be a credential, a vault reference, or anything an operator
typed. The version lookups are cached for a week, because spawning `npm` and
`pnpm` on every secret resolution would be absurd.

**`hostname` identifies a machine, and on a personal device often a person.** If
that is not a trade you want on an install, turn telemetry off.

## What is actually collected

| Category | Event | Carries |
| --- | --- | --- |
| Product analytics | `binary_started` | which binary, Node major version, whether installed as a plugin |
| Product analytics | `command_run` | subcommand name, outcome, duration |
| Metrics | `provider_resolved` | requested, resolved, missing, decorated, duration, session outcome |
| Metrics | `proxy_request` | HTTP status, duration, whether the credential was retried |
| Metrics | `doctor_report` | how many checks passed and failed |
| Logs | `diagnostic` | a log id from a fixed list, severity, a count |
| Tracing | `span_completed` | span name from a fixed list, duration, outcome |
| Error tracking | `$exception` | the error tag, and a stack reduced to basenames |

## What can never be collected

Secret values. Vault references (`pass://...`). Filesystem paths. Hostnames and
upstream URLs. Secret ids. Environment variables. Log message text. Error message
text. Command arguments. Anything typed by a person.

Not "is filtered out" — has no field to travel in.

## How this is verified

- Credential-shaped values are rejected under every field name, including
  innocuous ones.
- 2,000 randomly generated strings are attempted; none survives.
- Objects, arrays, functions, symbols, `null`, `undefined` and non-finite
  numbers are all dropped.
- Every event in the union is checked field by field, so the second filter is
  proven not to eat real diagnostics.
- End to end: the real built resolver resolves a real value from a stub vault,
  with telemetry enabled and pointed at a collector that keeps every byte sent,
  including compressed bodies. The test asserts the resolution genuinely
  happened, that telemetry genuinely transmitted, and that the value appears
  nowhere in what was sent — nor does the vault reference, nor the file path,
  even on the failure path.
- The same tests assert the failure is still *reported* by tag, so redaction is
  shown not to have cost the diagnosis.

## Turning it off, or pointing it elsewhere

```bash
OPENCLAW_PROTONPASS_TELEMETRY=false     # opt out entirely
```

The build carries a PostHog project key, so an install reports without anyone
configuring anything. A PostHog project API key is a write-only ingestion key of
the kind designed to ship inside clients: it can send events and read nothing
back.

```bash
OPENCLAW_PROTONPASS_POSTHOG_KEY=phc_your_own   # report to your own project
OPENCLAW_PROTONPASS_POSTHOG_KEY=""             # enabled, but send nowhere
OPENCLAW_PROTONPASS_POSTHOG_HOST=https://us.i.posthog.com
```

```bash
OPENCLAW_PROTONPASS_SERVICE_NAME=my-service     # how it appears in Tracing/Logs
OPENCLAW_PROTONPASS_ENVIRONMENT=staging
```

Reporting never affects behaviour: every capture is `Effect.ignore`d, so a
failing or unreachable analytics backend cannot fail a secret resolution.

## Source maps

The published binaries are bundles, so a raw stack trace would point at a line
in a 2 MB file. Each release uploads its source maps to PostHog, and injects a
matching chunk id into the bundle before publishing, so an error report resolves
back to the TypeScript that produced it. The maps are not shipped in the npm
package — they are 10 MB each and only PostHog needs them.
