## What this system is

A secret provider for [OpenClaw](https://openclaw.ai), backed by a
[Proton Pass](https://proton.me/pass) vault. OpenClaw holds a reference; this
resolves it to a value at the moment it is needed, so no credential is written
into a configuration file.

There are four executables because OpenClaw accepts a secret in three places
with three different rules, plus a management CLI:

| Executable | Role |
| --- | --- |
| `openclaw-protonpass-resolver` | The `exec` secret provider. One JSON request on stdin, one response on stdout. |
| `openclaw-pass-run` | Launches a stdio MCP server with `pass://` environment references resolved. |
| `openclaw-mcp-auth-proxy` | A loopback HTTP hop that attaches a credential header to remote MCP requests. |
| `openclaw-proton-pass` | `setup`, `token` and `doctor`. |

## Layout

```
libs/domain        branded types, schemas, the error union - no I/O
libs/config        Effect Config: every path, with an environment override
libs/pass-cli      PassSession and SecretResolver
libs/telemetry     the closed event union and its filters
apps/*             the four executables
tests/             mirrors the source tree
docs/              the Docs7 documentation site
ai-docs/           the sources for LLMS.md
```

Nx infers the project graph from imports, so build order follows the graph. Run
`pnpm verify` before claiming anything works: it typechecks, checks licence
headers and API contracts, runs the suite at 100% coverage with a depth report,
and regenerates the API reference - which compiles and executes every
documentation example.

## Four rules that explain most of the code

Read these before changing anything; each one is load-bearing and each has been
violated before, with consequences recorded in the commit history.

1. **stdout is the protocol.** The resolver writes its JSON response there and
   the proxy streams payloads through it. Every log line in every executable
   goes to stderr. A single log line on stdout corrupts what the Gateway parses.

2. **A secret is `Redacted` until the boundary that needs it.** There are three
   such boundaries: the protocol response, the child process environment, and
   the outbound HTTP header. Anywhere else, `Redacted.value` is a bug.

3. **Telemetry has no field a secret could occupy.** The event union has no
   field of type `string` - only numbers, booleans, and string literal unions.
   Adding one would not be a policy violation to be reviewed; it would be a
   change to the thing that makes the guarantee true.

4. **No module branches on the operating system except `libs/config/host.ts`.**
   Every host difference is a pure function there of the platform name and the
   environment, which is what makes each one testable from a machine that is
   not that host. Reaching for `process.platform` anywhere else, or assuming
   `HOME`, `chmod` or systemd, is the class of bug this file exists to
   prevent: the four executables run on Linux, macOS, Windows and in
   containers with no init system.
