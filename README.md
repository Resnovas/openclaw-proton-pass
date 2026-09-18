# openclaw-proton-pass

Resolve [OpenClaw](https://openclaw.ai) credentials from [Proton Pass](https://proton.me/pass) at
request time, so no API key is ever written into `openclaw.json`.

OpenClaw can hold a `SecretRef` in its credential fields, but it needs a provider to turn that
reference into a value. This repository is that provider, plus the wrappers needed for the cases
where OpenClaw cannot use a `SecretRef` at all.

Built with TypeScript and [Effect](https://effect.website) in an Nx workspace.

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
   resolver serves these directly — this is what the exec provider contract exists for.
2. **`mcp.servers.*.env`** accepts only literal strings. So `openclaw-pass-run` sits in front of the
   MCP server: OpenClaw passes a `pass://` URI through as an ordinary string, and the wrapper
   resolves it as it launches the child. The Gateway never sees the value.
3. **`mcp.servers.*.headers`** rejects `SecretRef`s from every source, and OpenClaw talks to a
   remote MCP server directly over HTTPS, so nothing in between could resolve a reference.
   `openclaw-mcp-auth-proxy` supplies the missing hop.

Prefer `"auth": "oauth"` whenever a remote server supports it; the proxy is for servers that only
take a bearer token.

## Requirements

- Node.js 20 or newer, and [pnpm](https://pnpm.io)
- [`pass-cli`](https://protonpass.github.io/pass-cli), logged in at least once
- A Proton Pass vault for these secrets (the examples call it `OpenClaw`)
- systemd, if you want the MCP auth proxy to run as a service

## Install

```bash
git clone https://github.com/Resnovas/openclaw-proton-pass.git
cd openclaw-proton-pass
pnpm install
pnpm build
node apps/cli/dist/main.js setup
```

`setup` creates `~/.config/proton-pass-cli` with mode `0700`, seeds the two configuration files if
they do not already exist, and writes the systemd user unit with absolute paths resolved for this
checkout. An existing configuration file is never overwritten.

```bash
node apps/cli/dist/main.js doctor   # what is installed, configured, and missing
```

## Set up

### 1. Create the agent token

The Gateway starts at boot, long before any terminal has logged in, so it cannot rely on your user
session. It authenticates with a dedicated agent token scoped to one vault:

```bash
pass-cli agent create openclaw-gateway --expiration 1y --vault OpenClaw
install -m 0600 /dev/stdin ~/.config/proton-pass-cli/openclaw-agent-pat <<< '<token>'
```

Every read that token performs is recorded in `pass-cli agent monitor openclaw-gateway`.

### 2. Map ids to vault references

`~/.config/proton-pass-cli/openclaw-secret-map.json` is the only place a vault path is written down:

```json
{
  "EXAMPLE_API_KEY": "pass://OpenClaw/example.com/API Key",
  "EXAMPLE_MCP_AUTHORIZATION": {
    "ref": "pass://OpenClaw/example.com/API Key",
    "prefix": "Bearer "
  }
}
```

The `prefix`/`suffix` form exists because one secret resolves to exactly one value, while an
`Authorization` header needs a scheme in front of the token. Decorating at resolution keeps a single
copy of the secret in the vault.

### 3. Register the provider with OpenClaw

```bash
openclaw config set secrets.providers.protonpass.source exec
openclaw config set secrets.providers.protonpass.command \
  "$(node -e 'console.log(process.execPath)') $PWD/apps/resolver/dist/main.js"
openclaw config set secrets.providers.protonpass.jsonOnly true
openclaw config set secrets.providers.protonpass.timeoutMs 60000
```

Restart the Gateway afterwards.

## Using it

### Credential fields

```bash
openclaw config set models.providers.openai.apiKey \
  --ref-provider protonpass --ref-source exec --ref-id EXAMPLE_API_KEY
```

### Local (stdio) MCP servers

```json
{
  "command": "node",
  "args": ["/path/to/openclaw-proton-pass/apps/pass-run/dist/main.js", "npx", "-y", "some-server"],
  "env": { "SOME_API_KEY": "pass://OpenClaw/example.com/API Key" }
}
```

### Remote (HTTP) MCP servers

Add a route to `~/.config/proton-pass-cli/openclaw-mcp-proxy.json`:

```json
{
  "listen": "127.0.0.1:18890",
  "routes": {
    "/example": {
      "upstream": "https://mcp.example.com/mcp",
      "header": "Authorization",
      "secretId": "EXAMPLE_MCP_AUTHORIZATION",
      "timeoutSeconds": 120
    }
  }
}
```

```bash
systemctl --user enable --now openclaw-mcp-auth-proxy
openclaw mcp add example --url http://127.0.0.1:18890/example --transport streamable-http
```

## Verify

The resolver speaks the Gateway's protocol on stdin and stdout:

```bash
echo '{"protocolVersion":1,"provider":"protonpass","ids":["EXAMPLE_API_KEY"]}' \
  | node apps/resolver/dist/main.js
```

A working provider answers `{"protocolVersion":1,"values":{"EXAMPLE_API_KEY":"..."}}`. An id missing
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
| `OPENCLAW_PROTONPASS_TELEMETRY` | `false` — see below |

## Telemetry

Off by default. This tool handles other people's credentials, so reporting is something you turn on
deliberately: set `OPENCLAW_PROTONPASS_TELEMETRY=true` and supply
`OPENCLAW_PROTONPASS_POSTHOG_KEY`. With either absent the telemetry service is a no-op.

Events carry shape, never content — counts and durations. A denylist drops any property whose name
suggests it could hold a secret, a vault path, a hostname or a URL, so the failure mode is a missing
property rather than a leaked one.

## Architecture

```
libs/domain      branded types, schemas and the error union — no I/O
libs/config      Effect Config: every path, with an environment override
libs/pass-cli    PassSession and SecretResolver services
libs/telemetry   opt-in PostHog reporting
apps/resolver    the exec secret provider
apps/pass-run    the stdio MCP wrapper
apps/mcp-auth-proxy  the loopback credential-injecting proxy
apps/cli         setup and doctor
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
pnpm build     # nx run-many -t build
pnpm test      # @effect/vitest
pnpm verify    # typecheck + licence headers + tests
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for coding standards.

## Troubleshooting

**`Already authenticated`** — `pass-cli login --pat` refuses whenever a session file exists,
including a stale one. The resolver logs out first; by hand, run `pass-cli logout` in the same
`PROTON_PASS_SESSION_DIR`.

**An opaque sqlcipher error** — `pass-cli` keeps an encrypted database in the session directory whose
key derives from the token, and `logout` leaves it behind, so a rotated token cannot decrypt it. The
resolver rebuilds the directory automatically; by hand, delete `~/.local/state/openclaw-protonpass`.

**The resolver and your terminal log each other out** — `pass-cli` keeps one session per directory.
That is why this provider uses its own; do not point it at the default.

**`no route for /...`** — the path in your OpenClaw MCP URL must match a key in `routes`. Restart the
proxy after editing the file.

## Security notes

- The proxy binds loopback only, enforced by the schema. Its routes are unauthenticated: anything
  reaching one gets a request signed with your real credential.
- Secrets live only in process memory, as `Redacted`. The proxy caches a value and re-resolves when
  an upstream answers `401`.
- The config directory is `0700` and its files `0600`.
- Scope the agent token to a single vault. It is the blast radius if the host is compromised.

## Licence

[FCL-1.0-MIT](LICENSE) — Fair Core License with an MIT future: source-available now, MIT-licensed on
the second anniversary of each release. Every source file carries the canonical header, checked by
`pnpm lint:headers`.
