## Failure

Seven tagged errors, one exhaustive union, declared in
`libs/domain/src/errors.ts`.

| Error | Raised when |
| --- | --- |
| `SecretMapError` | The map cannot be read or does not parse |
| `MissingAgentTokenError` | No agent token at the configured path |
| `SessionError` | No session could be established, even after a rebuild |
| `ResolutionError` | `pass-cli` exited non-zero while resolving |
| `ProtocolError` | The request on stdin is not well formed |
| `RouteConfigError` | The proxy's route file cannot be read or does not parse |
| `ProxyIoError` | The proxy cannot read a body or bind its listener |

Every member is a `Data.TaggedError`. That is not stylistic: `Data.TaggedError`
extends `Error`, so one untagged member widens the whole union to `Error` and
every `catchTag` in the codebase stops narrowing. If you add a failure mode,
tag it.

### Partial failure is not failure

The resolver reports per-id failures inside an otherwise successful response,
because one unknown id must not deny the Gateway the rest of the batch. A
top-level `error` means nothing could be produced at all.

There is exactly one per-id reason, `NOT_FOUND`. "Absent from the map" and "the
vault holds nothing there" are answered identically, so the provider cannot be
used to enumerate which ids exist. Do not add a second reason without
considering that.

### Errors carry the path, telemetry carries the tag

A domain error names the file it failed on, because an operator needs to know
which of three configuration files to look at. That same field is why the error
itself is never forwarded to error tracking - only its tag, with a stack
reduced to basenames.
