# openclaw-proton-pass

Resolve [OpenClaw](https://openclaw.ai) credentials from [Proton Pass](https://proton.me/pass) at
request time, so no API key is ever written into `openclaw.json`.

OpenClaw can hold a `SecretRef` in its credential fields, but it needs a provider to turn that
reference into a value. This repository is that provider, plus the two wrappers needed for the
cases where OpenClaw cannot use a `SecretRef` at all.

## What you get

| Component | Purpose |
| --- | --- |
| `openclaw-protonpass-resolver` | An OpenClaw `exec` secret provider. Answers the Gateway's JSON protocol on stdin/stdout, reading values from Proton Pass. |
| `openclaw-pass-run` | Launches a **stdio** MCP server with `pass://` environment references resolved. |
| `openclaw-mcp-auth-proxy` | A loopback HTTP hop that injects a credential header into **remote** MCP requests. |
| `openclaw-mcp-auth-proxy.service` | systemd user unit for the proxy. |

Nothing here stores a credential. The only thing written to disk is a map from opaque ids to
`pass://` references, plus the agent token that authenticates to your vault.

## Why three components and not one

OpenClaw accepts a secret in three different places, and each one has different rules:

1. **Credential fields** (`models.providers.*.apiKey`, tokens, and similar) accept a `SecretRef`.
   The resolver serves these directly — this is the case the exec provider contract exists for.

2. **`mcp.servers.*.env`** accepts only literal strings. A `SecretRef` there is rejected. So
   `openclaw-pass-run` sits in front of the MCP server: OpenClaw passes a `pass://` URI through as
   an ordinary string, and the wrapper resolves it as it launches the child. The Gateway never sees
   the value.

3. **`mcp.servers.*.headers`** also rejects `SecretRef`s — from every source, exec included — and
   OpenClaw talks to a remote MCP server directly over HTTPS, so there is no process in between
   that could resolve a reference anyway. `openclaw-mcp-auth-proxy` supplies the missing hop: point
   OpenClaw at a loopback route, and the proxy attaches the real header on the way out.

Prefer `"auth": "oauth"` whenever a remote server supports it; the proxy is for servers that only
take a bearer token.

## Requirements

- `python3` (3.8 or newer) and `bash`
- [`pass-cli`](https://protonpass.github.io/pass-cli), logged in at least once
- A Proton Pass vault for these secrets (the examples call it `OpenClaw`)
- systemd, if you want the MCP auth proxy to run as a service

## Install

```bash
git clone https://github.com/Resnovas/openclaw-proton-pass.git
cd openclaw-proton-pass
./install.sh
```

This copies the three executables to `~/.local/bin`, creates `~/.config/proton-pass-cli` with mode
`0700`, seeds the two configuration files from `examples/` if they do not already exist, and
registers the systemd user unit. An existing configuration file is never overwritten.

```bash
./install.sh --prefix /usr/local/bin   # install somewhere else
./install.sh --no-systemd              # skip the service
./install.sh --check                   # report what is installed and what is missing
./install.sh --uninstall               # remove executables and unit, keep your configs
```

## Set up

### 1. Create the agent token

The Gateway starts at boot, long before any terminal has logged in, so it cannot rely on your
user session. It authenticates with a dedicated agent token scoped to one vault:

```bash
pass-cli agent create openclaw-gateway --expiration 1y --vault OpenClaw
install -m 0600 /dev/stdin ~/.config/proton-pass-cli/openclaw-agent-pat <<< '<token>'
```

Every read that token performs is recorded in `pass-cli agent monitor openclaw-gateway`.

### 2. Map ids to vault references

`~/.config/proton-pass-cli/openclaw-secret-map.json` is the only place a vault path is written
down. Ids are opaque names, so a vault reshuffle is a one-file edit rather than a config migration:

```json
{
  "EXAMPLE_API_KEY": "pass://OpenClaw/example.com/API Key",
  "EXAMPLE_MCP_AUTHORIZATION": {
    "ref": "pass://OpenClaw/example.com/API Key",
    "prefix": "Bearer "
  }
}
```

The `prefix`/`suffix` form exists because a `SecretRef` resolves to exactly one value, while an
`Authorization` header needs a scheme in front of the token. Decorating here keeps a single copy of
the secret in the vault, instead of storing `Bearer <token>` as a second field that then has to be
rotated in lockstep with the first.

### 3. Register the provider with OpenClaw

```bash
openclaw config set secrets.providers.protonpass.source exec
openclaw config set secrets.providers.protonpass.command ~/.local/bin/openclaw-protonpass-resolver
openclaw config set secrets.providers.protonpass.jsonOnly true
openclaw config set secrets.providers.protonpass.timeoutMs 60000
```

which produces:

```json
"secrets": {
  "providers": {
    "protonpass": {
      "source": "exec",
      "command": "/home/you/.local/bin/openclaw-protonpass-resolver",
      "timeoutMs": 60000,
      "jsonOnly": true,
      "passEnv": ["PATH", "HOME"]
    }
  }
}
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
  "command": "openclaw-pass-run",
  "args": ["npx", "-y", "some-mcp-server"],
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

Start the proxy and point OpenClaw at the loopback address:

```bash
systemctl --user enable --now openclaw-mcp-auth-proxy
openclaw mcp add example --url http://127.0.0.1:18890/example --transport streamable-http
```

Restart the proxy after editing its routes: `systemctl --user restart openclaw-mcp-auth-proxy`.

## Verify

Ask the resolver for an id directly. It speaks the Gateway's protocol on stdin and stdout:

```bash
echo '{"protocolVersion":1,"provider":"protonpass","ids":["EXAMPLE_API_KEY"]}' \
  | openclaw-protonpass-resolver
```

A working provider answers `{"protocolVersion":1,"values":{"EXAMPLE_API_KEY":"..."}}`. An id
missing from the map comes back under `errors` as `NOT_FOUND` rather than failing the whole batch.

`./install.sh --check` reports what is installed, what is configured, and whether the service is
running.

## Configuration reference

Every path has a default and an environment override:

| Variable | Default | Used by |
| --- | --- | --- |
| `PASS_CLI` | `pass-cli` on `PATH`, else `~/.local/bin/pass-cli` | resolver, `openclaw-pass-run` |
| `OPENCLAW_PROTONPASS_CONFIG_DIR` | `$XDG_CONFIG_HOME/proton-pass-cli` | resolver |
| `OPENCLAW_PROTONPASS_SECRET_MAP` | `<config dir>/openclaw-secret-map.json` | resolver |
| `OPENCLAW_PROTONPASS_AGENT_PAT` | `<config dir>/openclaw-agent-pat` | resolver |
| `OPENCLAW_PROTONPASS_SESSION_DIR` | `$XDG_STATE_HOME/openclaw-protonpass` | resolver |
| `OPENCLAW_PROTONPASS_RESOLVER` | sibling of the caller, else `PATH` | proxy, `openclaw-pass-run` |
| `OPENCLAW_MCP_PROXY_CONFIG` | `<config dir>/openclaw-mcp-proxy.json` | proxy |

## Troubleshooting

**`agent PAT login failed: Already authenticated`** — `pass-cli login --pat` refuses whenever a
session file exists, including a stale one that `pass-cli info` can no longer read. The resolver
already handles this by logging out first; if you hit it by hand, run `pass-cli logout` in the same
`PROTON_PASS_SESSION_DIR`.

**`hmac check failed` or another opaque sqlcipher error** — `pass-cli` keeps an encrypted database
in the session directory whose key derives from the token. `logout` leaves that database behind, so
after the agent token is rotated the old database can no longer be decrypted. The resolver rebuilds
the directory automatically on the second attempt; by hand, delete
`~/.local/state/openclaw-protonpass` and retry.

**Reads rejected for an agent token** — agent tokens refuse audited reads unless
`PROTON_PASS_AGENT_REASON` is set. Both wrappers set it; a manual `pass-cli` invocation must too.

**The resolver and your terminal keep logging each other out** — `pass-cli` keeps one session per
directory. That is exactly why this provider uses its own `PROTON_PASS_SESSION_DIR`; do not point
it at the default.

**`no route for /...` from the proxy** — the path in your OpenClaw MCP URL must match a key in
`routes`. Restart the proxy after editing the file.

## Security notes

- The proxy refuses to bind anything but loopback. Its routes are unauthenticated: anything that
  can reach one gets a request signed with your real credential, so exposing it beyond `127.0.0.1`
  would hand out the secret it exists to protect.
- Secrets live only in process memory. The resolver writes a value to stdout, which the Gateway
  consumes; the proxy caches a value in memory and re-resolves when an upstream answers `401`.
- The agent token file and the config directory are created mode `0600`/`0700`. Keep them that way.
- Scope the agent token to a single vault. It is the blast radius if the host is compromised.

## License

[FSL-1.1-MIT](LICENSE) — Functional Source License with an MIT future: source-available now,
MIT-licensed two years after release.
