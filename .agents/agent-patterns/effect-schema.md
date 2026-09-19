# Effect Schema in this project

A practical reference for writing `Schema` code here. Effect v3 (`effect@^3.22`).
For anything not covered, read the schemas in `libs/domain/src` — they are the
worked examples this file summarises.

## Branded strings

Used for anything that could otherwise be confused with something else. `SecretId`
and `PassRef` are both strings; mixing them is the failure the brand exists to
prevent.

```ts
export const SecretId = Schema.String.pipe(
  Schema.minLength(1),
  Schema.brand("SecretId")
)
export type SecretId = typeof SecretId.Type
```

Always export the type alias beside the schema under the same name. Declaration
merging makes `SecretId` usable as both, which is what lets a signature read
`(id: SecretId)` while the decoder stays available as a value.

## Decode, never cast

```ts
const decode = Schema.decodeUnknownSync(PassRef)   // throws on invalid input
const decodeEffect = Schema.decodeUnknown(PassRef) // fails in an Effect
```

Use the Effect form at I/O boundaries so the failure joins the error channel;
`Sync` is for tests, documentation examples, and literal defaults.

**A cast defeats the brand.** There is no `as PassRef` in this codebase outside
one documented default in `ProxyConfig`, and that one is a loopback literal the
filter would accept anyway.

## Refinements that carry the reason

A filter returning a string produces that string as the failure message. Use it
to say *why*, because the message is what an operator sees:

```ts
export const ListenAddress = Schema.String.pipe(
  Schema.filter(
    (value) => {
      // ...
      return LOOPBACK.includes(host)
        ? true
        : `refusing to bind ${host}: this proxy is loopback-only by design`
    },
    { identifier: "ListenAddress" }
  ),
  Schema.brand("ListenAddress")
)
```

Put a safety rule in the schema when you can. A configuration that cannot be
represented cannot be loaded, which is strictly better than one that is checked
somewhere at runtime.

## Optional fields with defaults

```ts
Schema.optionalWith(Schema.String, { default: () => "Authorization" })
```

The decoded type then has the field as **required**, so nothing downstream has
to handle the absent case. Prefer this to `Schema.optional` whenever a sensible
default exists.

`Schema.optional` is for genuinely absent data — `values` and `errors` in
`ResolveResponse`, where "no values at all" and "an empty object" differ on the
wire.

## Unions of shapes

```ts
export const SecretMapEntry = Schema.Union(PassRef, DecoratedSecret)
```

Then normalise immediately, so no caller branches on which shape was written:

```ts
export const normaliseEntry = (entry: SecretMapEntry) =>
  typeof entry === "string"
    ? { ref: entry, prefix: "", suffix: "" }
    : { ref: entry.ref, prefix: entry.prefix, suffix: entry.suffix }
```

## Records keyed by a branded type

```ts
export const SecretMap = Schema.Record({ key: SecretId, value: SecretMapEntry })
```

The decoded record is keyed by `SecretId`, not `string`, so even a lookup
requires a decoded id. `Object.hasOwn` and index access both need the brand.

## Avoid

- `Schema.Any` and `Schema.Unknown` in a decoded shape. If you cannot describe
  it, the boundary is in the wrong place.
- Casting into a brand.
- Validating in a handler what a schema could have refused at load.
- `Schema.optional` where `optionalWith` and a default would remove a branch.
