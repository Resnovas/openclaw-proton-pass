# Effect services and layers in this project

A practical reference for defining and wiring services here. Effect v3
(`effect@^3.22`). The worked examples are `libs/config/src/paths.ts`,
`libs/pass-cli/src/session.ts` and `libs/telemetry/src/telemetry.ts`.

## Defining a service

`Effect.Service` - the Effect 3.22 API for defining a service together with its
layers. It generates `.Default`, so a service is usable without hand-writing a
layer.

```ts
export class PassSession extends Effect.Service<PassSession>()("PassSession", {
  effect: Effect.gen(function* () {
    const paths = yield* Paths
    // ... build the implementation
    return { ensure, baseEnv } as const
  }),
  dependencies: [Paths.Default, Telemetry.Default]
}) {}
```

Points that matter:

- The **tag string** is the service's identity. It must be unique and should
  match the class name.
- `dependencies` supplies the service's own requirements, so a caller writes
  `Effect.provide(PassSession.Default)` and nothing more.
- Return `as const` so the shape is inferred with readonly members rather than
  widened.
- The constructor effect runs **once per layer**, which is where one-time work
  belongs - path discovery, reading configuration, building a cache.

## Consuming one

```ts
const program = Effect.gen(function* () {
  const session = yield* PassSession
  yield* session.ensure
}).pipe(Effect.provide(PassSession.Default))
```

`yield* Service` in a generator is how you obtain it. Do not thread the
implementation through function arguments.

## Composing at the entry point

Every executable builds one layer and provides it once, in `app.ts`:

```ts
export const layer = Layer.mergeAll(
  SecretResolver.Default,
  PassSession.Default,
  Paths.Default,
  Telemetry.Default
).pipe(Layer.provideMerge(NodeContext.layer), Layer.merge(StderrLoggerLive))
```

- `Layer.mergeAll` for siblings.
- `Layer.provideMerge(NodeContext.layer)` supplies the platform services
  (`FileSystem`, `Path`, `Command`) **and** keeps them in the output, because
  the program uses them directly too.
- `Layer.merge(StderrLoggerLive)` replaces the default stdout logger. Every
  executable here does this - stdout carries protocol output, so a log line
  there corrupts it.

## Configuration is a service concern too

Read configuration in the service constructor, not at each call site:

```ts
const timeoutMillis = yield* commandTimeoutMillis
```

`Config<A>` is an `Effect<A, ConfigError>` in Effect 3, so it can be yielded
directly. Test it by supplying a provider rather than by mutating the
environment:

```ts
Effect.withConfigProvider(ConfigProvider.fromMap(new Map([["KEY", "value"]])))
```

## Interfaces for a service with two implementations

`Telemetry` presents one interface whether or not reporting is enabled, so no
call site branches on it:

```ts
export interface TelemetryApi {
  readonly capture: (event: TelemetryEvent) => Effect.Effect<void>
  readonly flush: Effect.Effect<void>
  readonly active: boolean
}
```

The disabled implementation satisfies the same interface and does nothing. This
is preferable to an `Option<Telemetry>` that every caller has to unwrap.

## Avoid

- `Context.Tag` and a hand-written layer where `Effect.Service` will do.
- Constructing a service inside a request path. That is what the layer is for.
- Providing layers deep in the call graph. Provide once, at the entry point.
- A service that reads configuration at call time rather than at construction.
- Tacit calls - `Effect.map(fn)`. Write `Effect.map((x) => fn(x))`; the explicit
  form keeps inference and stack traces intelligible.
