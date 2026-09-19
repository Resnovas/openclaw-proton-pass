# openclaw-proton-pass

Resolve [OpenClaw](https://openclaw.ai) credentials from [Proton Pass](https://proton.me/pass) at
request time, so no API key is ever written into `openclaw.json`.

OpenClaw can hold a `SecretRef` in its credential fields, but it needs a provider to turn that
reference into a value. This repository is that provider, plus the wrappers needed for the cases
where OpenClaw cannot use a `SecretRef` at all.

Built with TypeScript and [Effect](https://effect.website) in an Nx workspace.

**The full documentation is in [`docs/`](docs/)** - a
[Docs7](https://context7.com/docs/docs7/overview) site covering a guide for
each integration path, the concepts, the security model, and an API reference
generated from the source with every example compiled and executed. Preview it
with `pnpm docs:dev`.

Agents should start at [`LLMS.md`](LLMS.md) and [`AGENTS.md`](AGENTS.md).

## What you get

| Binary | Purpose |
| --- | --- |
| `openclaw-protonpass-resolver` | An OpenClaw `exec` secret provider. Answers the Gateway's JSON protocol on stdin/stdout. |
| `openclaw-pass-run` | Launches a **stdio** MCP server with `pass://` environment references resolved. |
| `openclaw-mcp-auth-proxy` | A loopback HTTP hop that injects a credential header into **remote** MCP requests. |
| `openclaw-proton-pass` | `setup` and `doctor`, built with `@effect/cli`. |

Nothing here stores a credential. The only things on disk are a map from opaque ids to `pass://`
references, and the agent token that authenticates to your vault.

## Why three components

OpenClaw accepts a secret in three places, and each has different rules:

1. **Credential fields** (`models.providers.*.apiKey` and similar) accept a `SecretRef`. The
   resolver serves these directly - this is what the exec provider contract exists for.
2. **`mcp.servers.*.env`** accepts only literal strings. So `openclaw-pass-run` sits in front of the
   MCP server: OpenClaw passes a `pass://` URI through as an ordinary string, and the wrapper
   resolves it as it launches the child. The Gateway never sees the value.
3. **`mcp.servers.*.headers`** rejects `SecretRef`s from every source, and OpenClaw talks to a
   remote MCP server directly over HTTPS, so nothing in between could resolve a reference.
   `openclaw-mcp-auth-proxy` supplies the missing hop.

Prefer `"auth": "oauth"` whenever a remote server supports it; the proxy is for servers that only
take a bearer token.

## Requirements

- Node.js 20 or newer
- [`pass-cli`](https://protonpass.github.io/pass-cli), logged in at least once
- A Proton Pass vault for these secrets (the examples call it `OpenClaw`)

## Install

### As an OpenClaw plugin

The plugin declares the secret provider itself, so OpenClaw wires it up without
any `openclaw.json` editing:

```bash
openclaw plugins install clawhub:@resnovas/openclaw-proton-pass
```

npm works as a direct source too:

```bash
openclaw plugins install npm:@resnovas/openclaw-proton-pass
```

Installing registers a `protonpass` SecretRef provider. OpenClaw resolves it from
the plugin manifest at startup, so disabling or removing the plugin revokes the
provider rather than leaving a dangling `command` path behind.

### As standalone command-line tools

```bash
npm install -g @resnovas/openclaw-proton-pass
openclaw-proton-pass setup
```

Linux, macOS and Windows are all supported, as is a container with no init
system. `setup` detects the host and writes the right thing for it.

### From GitHub Packages

Every release is published to this repository's GitHub Packages registry as
well as to npm. Point the scope at it and install as usual:

```bash
echo '@resnovas:registry=https://npm.pkg.github.com' >> .npmrc
npm install -g @resnovas/openclaw-proton-pass
```

Reading from GitHub Packages requires a GitHub token with `read:packages`,
which `npm login --registry=https://npm.pkg.github.com` will prompt for.

That puts four commands on `PATH` - `openclaw-proton-pass`,
`openclaw-protonpass-resolver`, `openclaw-pass-run` and
`openclaw-mcp-auth-proxy` - each a self-contained bundle needing only Node.

### From a release archive

Every release attaches `openclaw-proton-pass-bin-<version>.zip` containing the
four bundles. Unzip anywhere and run them with `node`; no install step, no
`node_modules`.

### From source

```bash
git clone https://github.com/Resnovas/openclaw-proton-pass.git
cd openclaw-proton-pass
pnpm install
pnpm build
node apps/cli/dist/main.js setup
```

`setup` creates the configuration directory readable only by your account,
seeds the two configuration files if they do not already exist, and writes
whatever this host uses to keep the proxy running: a systemd user unit, a
launch agent, a Task Scheduler definition, or a launcher script where there is
no init system. It prints the path and the command that enables it. An
existing configuration file is never overwritten.

The configuration directory is `~/.config/proton-pass-cli` on Linux and macOS,
and `%APPDATA%\proton-pass-cli` on Windows.

```bash
openclaw-proton-pass doctor   # what is installed, configured, and missing
```

## Set up

### 1. Create the agent token

The Gateway starts at boot, long before any terminal has logged in, so it cannot rely on your user
session. It authenticates with a dedicated agent token scoped to one vault:

```bash
pass-cli agent create openclaw-gateway --expiration 1y --vault OpenClaw
openclaw-proton-pass token   # paste the token, then Ctrl-D
```

`token` stores it in a file readable only by your account. On a container or a
managed host, supply it through the environment instead and no file is written
or read:

```bash
export OPENCLAW_PROTONPASS_AGENT_TOKEN='pst_...'
```

The variable wins whenever both exist. It is never passed to `pass-cli` as a
command-line argument, because a process's arguments are readable by every
other process on the host.

Every read that token performs is recorded in `pass-cli agent monitor openclaw-gateway`,
naming the ids that were read and, where the caller knows it, the route or command they were
for. Set `OPENCLAW_PROTONPASS_AUDIT_LABEL` to add anything else this host knows, such as which
agent or job it is running.

### 2. Map ids to vault references

`~/.config/proton-pass-cli/openclaw-secret-map.json` is the only place a vault path is written down:

```json
{
  "CONTEXT7_API_KEY": "pass://OpenClaw/context7.com/API Key",
  "CONTEXT7_MCP_AUTHORIZATION": {
    "ref": "pass://OpenClaw/context7.com/API Key",
    "prefix": "Bearer "
  }
}
```

The examples use [Context7](https://github.com/upstash/context7), a free and
open-source MCP server that authenticates with `Authorization: Bearer <key>`, so
every example below can be run as written.

The `prefix`/`suffix` form exists because one secret resolves to exactly one value, while an
`Authorization` header needs a scheme in front of the token. Decorating at resolution keeps a single
copy of the secret in the vault.

### 3. Register the provider with OpenClaw

Installed as a plugin, this is already done - the manifest declares the provider
and OpenClaw materialises it at startup.

Configure it by hand only when running the binaries standalone:

```bash
openclaw config set secrets.providers.protonpass.source exec
openclaw config set secrets.providers.protonpass.command "$(command -v openclaw-protonpass-resolver)"
openclaw config set secrets.providers.protonpass.jsonOnly true
openclaw config set secrets.providers.protonpass.timeoutMs 60000
```

Restart the Gateway afterwards.

## Using it

### Credential fields

```bash
openclaw config set models.providers.openai.apiKey \
  --ref-provider protonpass --ref-source exec --ref-id CONTEXT7_API_KEY
```

### Local (stdio) MCP servers

```json
{
  "command": "openclaw-pass-run",
  "args": ["npx", "-y", "@upstash/context7-mcp"],
  "env": { "CONTEXT7_API_KEY": "pass://OpenClaw/context7.com/API Key" }
}
```

### Remote (HTTP) MCP servers

Add a route to `~/.config/proton-pass-cli/openclaw-mcp-proxy.json`:

```json
{
  "listen": "127.0.0.1:18890",
  "routes": {
    "/context7": {
      "upstream": "https://mcp.context7.com/mcp",
      "header": "Authorization",
      "secretId": "CONTEXT7_MCP_AUTHORIZATION",
      "timeoutSeconds": 120
    }
  }
}
```

```bash
systemctl --user enable --now openclaw-mcp-auth-proxy
openclaw mcp add context7 --url http://127.0.0.1:18890/context7 --transport streamable-http
```

## Verify

The resolver speaks the Gateway's protocol on stdin and stdout:

```bash
echo '{"protocolVersion":1,"provider":"protonpass","ids":["CONTEXT7_API_KEY"]}' \
  | openclaw-protonpass-resolver
```

A working provider answers `{"protocolVersion":1,"values":{"CONTEXT7_API_KEY":"..."}}`. An id missing
from the map comes back under `errors` as `NOT_FOUND` rather than failing the batch.

**stdout carries only protocol JSON.** All diagnostics go to stderr, because a log line interleaved
with the response would corrupt what the Gateway parses. There are tests that assert exactly this.

## Configuration reference

Every path has a default and an environment override:

| Variable | Default |
| --- | --- |
| `PASS_CLI` | `pass-cli` on `PATH`, else the installer's usual locations |
| `OPENCLAW_PROTONPASS_CONFIG_DIR` | `$XDG_CONFIG_HOME/proton-pass-cli` |
| `OPENCLAW_PROTONPASS_SECRET_MAP` | `<config dir>/openclaw-secret-map.json` |
| `OPENCLAW_PROTONPASS_AGENT_PAT` | `<config dir>/openclaw-agent-pat` |
| `OPENCLAW_PROTONPASS_SESSION_DIR` | `$XDG_STATE_HOME/openclaw-protonpass` |
| `OPENCLAW_MCP_PROXY_CONFIG` | `<config dir>/openclaw-mcp-proxy.json` |
| `OPENCLAW_PROTONPASS_TELEMETRY` | `true` - see below |

## Telemetry

On by default, and one variable to turn off:

```bash
OPENCLAW_PROTONPASS_TELEMETRY=false
```

The build carries a PostHog project key - a write-only ingestion key of the kind
designed to ship inside clients, which can send events and read nothing back.

Reports cover product analytics, metrics, logs, tracing and error tracking, and
are attributed to a random install id stored at
`~/.config/proton-pass-cli/install-id`, alongside a description of the machine
(OS, Node, npm, pnpm and `pass-cli` versions, CPU, memory, timezone, hostname)
so a failure can be correlated with what it runs on.

Events carry shape, never content: counts and durations. A denylist drops any
property whose name suggests a secret, a vault path, a hostname or a URL, so the
failure mode is a missing property rather than a leaked one.

It covers product analytics, metrics, structured logs, tracing and error
tracking. It cannot carry a secret: every event field is a number, a boolean, or
a string from a fixed list declared in the source, so there is no field an
arbitrary value can travel in.

**[The telemetry page](docs/security/telemetry.mdx) explains exactly how that
works**, in plain language first and then precisely, along with what is
collected, what can never be collected, and how both are tested.

To report somewhere else, set `OPENCLAW_PROTONPASS_POSTHOG_KEY` and
`OPENCLAW_PROTONPASS_POSTHOG_HOST`. To keep telemetry enabled while sending
nothing anywhere, set the key to an empty string.

## Architecture

```
libs/domain      branded types, schemas and the error union - no I/O
libs/config      Effect Config: every path, with an environment override
libs/pass-cli    PassSession and SecretResolver services
libs/telemetry   opt-in PostHog reporting
apps/resolver    the exec secret provider
apps/pass-run    the stdio MCP wrapper
apps/mcp-auth-proxy  the loopback credential-injecting proxy
apps/cli         setup, token and doctor
tests/           mirrors the source tree, @effect/vitest
```

Secrets are carried as `Redacted` from the moment they leave `pass-cli`, and unwrapped only at the
boundary that needs the value: the protocol response, or the outbound header. A stray log line
cannot print one.

The loopback-only rule is expressed in the type system: `ListenAddress` refuses to represent a
non-loopback address, so a misconfiguration fails at load rather than after the proxy is already
serving credentials to anything that can reach it.

## Development

```bash
pnpm build           # nx run-many -t build
pnpm test            # @effect/vitest
pnpm coverage        # with 100% thresholds enforced
pnpm coverage:depth  # how many times each line actually ran
pnpm verify          # all of the above, in order
```

Integration tests run against a real vault only when told which id to use, so
they can never read from one by accident:

```bash
OPP_INTEGRATION_SECRET_ID=SOME_ID pnpm exec vitest run tests/integration
```

Releases are cut by the **Release** workflow, which versions from conventional
commits with `nx release`, writes the changelog, tags, publishes to npm with
provenance and to GitHub Packages, attaches the bundles to the GitHub release,
publishes the plugin to ClawHub, and records the release in PostHog and Linear.

npm publishing prefers [trusted
publishing](https://docs.npmjs.com/trusted-publishers) over a stored token, and
the workflow can submit a version for review with `npm stage publish` instead
of releasing it outright.

See [CONTRIBUTING.md](CONTRIBUTING.md) for coding standards.

## Troubleshooting

**`Already authenticated`** - `pass-cli login` refuses whenever a session file exists,
including a stale one. The resolver logs out first; by hand, run `pass-cli logout` in the same
`PROTON_PASS_SESSION_DIR`.

**An opaque sqlcipher error** - `pass-cli` keeps an encrypted database in the session directory whose
key derives from the token, and `logout` leaves it behind, so a rotated token cannot decrypt it. The
resolver rebuilds the directory automatically; by hand, delete `~/.local/state/openclaw-protonpass`.

**The resolver and your terminal log each other out** - `pass-cli` keeps one session per directory.
That is why this provider uses its own; do not point it at the default.

**`no route for /...`** - the path in your OpenClaw MCP URL must match a key in `routes`. Restart the
proxy after editing the file.

## Security notes

- The proxy binds loopback only, enforced by the schema. Its routes are unauthenticated: anything
  reaching one gets a request signed with your real credential.
- Secrets live only in process memory, as `Redacted`. The proxy caches a value and re-resolves when
  an upstream answers `401`.
- The config directory is `0700` and its files `0600`.
- Scope the agent token to a single vault. It is the blast radius if the host is compromised.

## Licence

[FCL-1.0-MIT](LICENSE) - Fair Core License with an MIT future: source-available now, MIT-licensed on
the second anniversary of each release. Every source file carries the canonical header, checked by
`pnpm lint:headers`.
