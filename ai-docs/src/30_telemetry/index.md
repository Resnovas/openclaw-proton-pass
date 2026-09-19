## Telemetry

Reporting is **on by default**, and the reason that is defensible for a tool
handling credentials is structural rather than procedural.

The event union in `libs/telemetry/src/events.ts` has no field of type
`string`. Fields are numbers, booleans, or unions of string literals declared
in that file. A secret is a runtime string of unknown content, so there is no
field it can be assigned to. The compiler enforces this, so a violation is a
build failure rather than a review comment someone might miss.

Behind that, `toProperties` filters on the **value**: a finite number or a
boolean passes, a string passes only if it appears verbatim in
`ALLOWED_VALUES`, and everything else is dropped. Filtering by value rather
than by name matters - a name-based denylist only blocks names someone thought
of, and is defeated by putting a secret under an innocuous key.

### If you are adding an event

1. Add it to the `TelemetryEvent` union. Use numbers, booleans and literal
   unions only.
2. Add any new literals to `ALLOWED_VALUES`, or they will be dropped at
   runtime even though they compile.
3. Do not add a field of type `string`. If you believe you need one, you are
   about to describe content rather than shape; describe the shape instead.

### Signals

Each goes to the PostHog product that displays it: analytics through `capture`,
metrics through the metrics client, tracing through `span`, logs over OTLP with
an id rather than a message, and errors through `captureError` by tag with a
stack reduced to basenames.

Reporting never affects behaviour - every capture is ignored on failure, so an
unreachable backend cannot fail a secret resolution.
