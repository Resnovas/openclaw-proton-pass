---
title: "1Password compatibility matrix"
description: "The 1Password Connect and op CLI capabilities the alias implements, pinned against the vendored Connect OpenAPI specs and the op CLI help snapshot."
---

# 1Password compatibility capability matrix

Machine-readable source: [`matrix.json`](./matrix.json). CI checks this file against
the vendored Connect OpenAPI specs (`externals/onepassword-connect-openapi/`) and
the pinned `op` CLI help snapshot (`externals/onepassword-cli/op-help-2.30.3.txt`)
via `pnpm check-matrix`.

## Pins

| Surface | Version |
| --- | --- |
| Connect HTTP | 1.8.1 |
| `op` CLI | 2.30.3 |
| pass-cli | current (installed binary) |

## Category mapping (Proton Pass to Connect)

| Proton Pass type | Connect `category` | Notes |
| --- | --- | --- |
| Login | `LOGIN` | |
| Note | `SECURE_NOTE` | |
| Credit card | `CREDIT_CARD` | |
| Identity | `IDENTITY` | |
| SSH key | `SSH_KEY` | `ssh-format=openssh` on `op://` reads |
| Wifi | `WIRELESS_ROUTER` | |
| Alias | `SECURE_NOTE` (read) | Write of unsupported categories fails |

1Password `PASSWORD` items are stored as Proton Login. `op item delete` (archive default)
maps to Proton trash, not permanent delete.

## Status legend

- **supported** - implemented against Proton Pass via `libs/onepassword-compat`
- **unsupported** - returns a documented 1Password-shaped error (never silent success)

See `matrix.json` for the full Connect path and CLI command list.
