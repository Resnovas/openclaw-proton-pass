## Secrets: ids, references and values

Three kinds of string that must never be confused, which is why two of them are
branded.

| | Example | Written where |
| --- | --- | --- |
| **Id** | `CONTEXT7_API_KEY` | `openclaw.json` and the secret map |
| **Reference** | `pass://OpenClaw/context7.com/API Key` | the secret map, and nowhere else |
| **Value** | the credential | nowhere on disk |

An id is opaque on purpose: the map is the only place a vault location appears,
so moving an item between vaults is a one-file edit rather than a configuration
migration.

`SecretId` and `PassRef` are branded schemas. Construct them by decoding, never
by casting — a cast is how a resolved value ends up somewhere expecting a
reference.

One vault entry can serve two consumers through decoration: a bare credential
field wants the token alone, an `Authorization` header wants `Bearer ` in front
of it. Two vault entries would have to be rotated together, and eventually would
not be.
