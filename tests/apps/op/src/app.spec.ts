/*
 * Project: openclaw-proton-pass
 * File: app.spec.ts
 * Last Modified: 2026-09-20
 *
 * Contributing: Please read through our contributing guidelines. Included are directions for opening issues, coding standards,
 * and notes on development. These can be found at
 * https://github.com/Resnovas/openclaw-proton-pass/blob/main/CONTRIBUTING.md
 *
 * Code of Conduct: This project abides by the Contributor Covenant, v2.0. Please interact in ways that contribute to an open,
 * welcoming, diverse, inclusive, and healthy community. Our Code of Conduct can be found at
 * https://github.com/Resnovas/openclaw-proton-pass/blob/main/CODE_OF_CONDUCT.md
 *
 * Copyright (c) 2026 Jonathan Stevens T/A Resnovas. All Rights Reserved
 * LICENSE: Fair Core License, Version 1.0, MIT Future License (FCL-1.0-MIT)
 *
 * This program has been provided under confidence of the copyright holder and is licensed for copying, distribution and
 * modification under the terms of the Fair Core License, Version 1.0, MIT Future License (FCL-1.0-MIT) published as the License, or
 * (at your option) any later version of this license. You must not move, change, disable, or circumvent the license key functionality
 * in the Software; or modify any portion of the Software protected by the license key to: enable access to the protected
 * functionality without a valid license key; or remove the protected functionality. This program is distributed in the hope that it
 * will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A
 * PARTICULAR PURPOSE. See the Fair Core License, Version 1.0, MIT Future License for more details. You should have received a
 * copy of the Fair Core License, Version 1.0, MIT Future License along with this program. If not, please write to:
 * hello@resnovas.com, see the official website https://fcl.dev/ or review the GitHub repository
 * https://github.com/keygen-sh/fcl.dev/
 *
 * This project abides the Resnovas Cooperation Commitment. Adapted from the GPL Cooperation Commitment (GPLCC). Before filing
 * or continuing to prosecute any legal proceeding or claim (other than a Defensive Action) arising from termination of a Covered
 * License, we commit to adhering to the Resnovas Cooperation Commitment. You should have received a copy of the Resnovas
 * Cooperation Commitment along with this program. If not, please write to: hello@resnovas.com, or see
 * https://github.com/Resnovas/openclaw-proton-pass/blob/main/COOPERATION_COMMITMENT.md
 *
 * DELETING THIS NOTICE AUTOMATICALLY VOIDS YOUR LICENSE
 */

import { afterEach, describe, expect, it } from "@effect/vitest"
import { NodeContext } from "@effect/platform-node"
import { Effect, Exit, Layer, Redacted } from "effect"
import { chmodSync, writeFileSync } from "node:fs"
import { Paths, StderrLoggerLive } from "@resnovas/opp-config"
import { OnePasswordCompat } from "@resnovas/opp-onepassword-compat"
import { layer, run } from "@resnovas/opp-op"
import { PassSession } from "@resnovas/opp-pass-cli"
import { Telemetry } from "@resnovas/opp-telemetry"
import {
  captureStdout,
  withExitCode,
  withFailingStdin,
  withStdin
} from "../../../helpers/process.js"
import { makeWorkspace, type Workspace } from "../../../helpers/workspace.js"

let workspace: Workspace | undefined

afterEach(() => {
  workspace?.dispose()
  workspace = undefined
})

const invoke = (args: ReadonlyArray<string>) =>
  Effect.runPromise(run(["node", "op", ...args]).pipe(Effect.provide(layer), Effect.exit))

describe("opp-op app", () => {
  it("reports whoami details", async () => {
    workspace = makeWorkspace({ secretMap: "{}", stub: { infoExit: 0 } })
    const { result, output } = await captureStdout(() => invoke(["whoami"]))
    expect(Exit.isSuccess(result)).toBe(true)
    expect(output).toContain("user-1")
    expect(output).toContain("agent@example.com")
  })

  it("lists vaults", async () => {
    workspace = makeWorkspace({ secretMap: "{}", stub: { infoExit: 0 } })
    const { result, output } = await captureStdout(() => invoke(["vault", "list"]))
    expect(Exit.isSuccess(result)).toBe(true)
    expect(output).toContain("Private")
    expect(output).toContain("share-1")
  })

  it("reads a secret reference to stdout", async () => {
    workspace = makeWorkspace({ secretMap: "{}", stub: { infoExit: 0 } })
    const { result, output } = await captureStdout(() =>
      invoke(["read", "op://Private/GitHub/password"])
    )
    expect(Exit.isSuccess(result)).toBe(true)
    expect(output).toBe("secret-value\n")
  })

  it("fails unsupported commands with a non-zero exit", async () => {
    workspace = makeWorkspace({ secretMap: "{}", stub: { infoExit: 0 } })
    const result = await invoke(["item", "create"])
    expect(Exit.isFailure(result)).toBe(true)
  })

  it("fails other unsupported command groups", async () => {
    workspace = makeWorkspace({ secretMap: "{}", stub: { infoExit: 0 } })
    const signin = await invoke(["signin"])
    const completion = await invoke(["completion"])
    expect(Exit.isFailure(signin)).toBe(true)
    expect(Exit.isFailure(completion)).toBe(true)
  })

  it("reports whoami as JSON", async () => {
    workspace = makeWorkspace({ secretMap: "{}", stub: { infoExit: 0 } })
    const { result, output } = await captureStdout(() => invoke(["whoami", "--format", "json"]))
    expect(Exit.isSuccess(result)).toBe(true)
    expect(JSON.parse(output).accountUuid).toBe("user-1")
  })

  it("reads a secret reference as JSON", async () => {
    workspace = makeWorkspace({ secretMap: "{}", stub: { infoExit: 0 } })
    const { result, output } = await captureStdout(() =>
      invoke(["read", "op://Private/GitHub/password", "--format", "json"])
    )
    expect(Exit.isSuccess(result)).toBe(true)
    expect(JSON.parse(output).value).toBe("secret-value")
  })

  it("lists vaults and fetches one vault in both formats", async () => {
    workspace = makeWorkspace({ secretMap: "{}", stub: { infoExit: 0 } })
    const listed = await captureStdout(() => invoke(["vault", "list", "--format", "json"]))
    expect(JSON.parse(listed.output)[0]?.name).toBe("Private")

    const fetched = await captureStdout(() => invoke(["vault", "get", "Private"]))
    expect(fetched.output).toContain("Private")
  })

  it("lists and loads items", async () => {
    workspace = makeWorkspace({ secretMap: "{}", stub: { infoExit: 0 } })
    const listed = await captureStdout(() =>
      invoke(["item", "list", "--vault", "Private", "--format", "json"])
    )
    expect(JSON.parse(listed.output)[0]?.title).toBe("GitHub")

    const human = await captureStdout(() => invoke(["item", "list", "--vault", "Private"]))
    expect(human.output).toContain("GitHub")

    const concealed = await captureStdout(() =>
      invoke(["item", "get", "GitHub", "--vault", "Private", "--format", "json"])
    )
    expect(concealed.output).not.toContain("secret-value")

    const revealed = await captureStdout(() =>
      invoke(["item", "get", "GitHub", "--vault", "Private", "--format", "json", "--reveal"])
    )
    expect(revealed.output).toContain("secret-value")
  })

  it("reads a one-time password when requested", async () => {
    workspace = makeWorkspace({ secretMap: "{}", stub: { infoExit: 0 } })
    const totpView = JSON.stringify({
      item: {
        id: "item-1",
        share_id: "share-1",
        vault_id: "vault-1",
        state: "Active",
        content: {
          title: "GitHub",
          note: "",
          content: {
            username: "user",
            password: "secret-value",
            totp: "otpauth://totp/GitHub:agent?secret=JBSWY3DPEHPK3PXP",
            urls: ["https://github.com"]
          }
        }
      }
    }).replaceAll("'", "'\\''")
    writeFileSync(
      workspace.passCli,
      `#!/usr/bin/env bash
case "$1" in
  info)
    if [ "$2" = "--output" ]; then
      echo '{"id":"user-1","email":"agent@example.com","username":"agent","release_track":"stable"}'
      exit 0
    fi
    exit 0
    ;;
  logout) exit 0 ;;
  login) exit 0 ;;
  vault)
    if [ "$2" = "list" ] && [ "$4" = "json" ]; then
      echo '{"vaults":[{"name":"Private","vault_id":"vault-1","share_id":"share-1"}]}'
      exit 0
    fi
    exit 1
    ;;
  item)
    if [ "$2" = "list" ] && [ "$6" = "json" ]; then
      echo '{"items":[{"id":"item-1","share_id":"share-1","vault_id":"vault-1","title":"GitHub","item_type":"login","state":"Active"}]}'
      exit 0
    fi
    if [ "$2" = "view" ] && [ "$8" = "json" ]; then
      echo '${totpView}'
      exit 0
    fi
    if [ "$2" = "view" ] && [ "$3" = "pass://Private/GitHub/totp?totp=code" ]; then
      echo "123456"
      exit 0
    fi
    exit 1
    ;;
  run) exit 0 ;;
  *) exit 0 ;;
esac
`,
      "utf8"
    )
    chmodSync(workspace.passCli, 0o755)

    const { result, output } = await captureStdout(() =>
      invoke(["item", "get", "GitHub", "--vault", "Private", "--otp"])
    )
    expect(Exit.isSuccess(result)).toBe(true)
    expect(output.trim()).toBe("123456")
  })

  it("reports missing otp fields", async () => {
    workspace = makeWorkspace({ secretMap: "{}", stub: { infoExit: 0 } })
    const result = await invoke([
      "item",
      "get",
      "GitHub",
      "--vault",
      "Private",
      "--otp",
      "--format",
      "json"
    ])
    expect(Exit.isFailure(result)).toBe(true)
  })

  it("substitutes op references in injected templates", async () => {
    workspace = makeWorkspace({ secretMap: "{}", stub: { infoExit: 0 } })
    const { result, output } = await withStdin("user=op://Private/GitHub/password\n", () =>
      captureStdout(() => invoke(["inject"]))
    )
    expect(Exit.isSuccess(result)).toBe(true)
    expect(output).toBe("user=secret-value\n")
  })

  it("passes inject templates without secret references through unchanged", async () => {
    workspace = makeWorkspace({ secretMap: "{}", stub: { infoExit: 0 } })
    const { result, output } = await withStdin("plain template\n", () =>
      captureStdout(() => invoke(["inject"]))
    )
    expect(Exit.isSuccess(result)).toBe(true)
    expect(output).toBe("plain template\n")
  })

  it("reports whoami without optional profile fields", async () => {
    workspace = makeWorkspace({ secretMap: "{}", stub: { infoExit: 0 } })
    writeFileSync(
      workspace.passCli,
      `#!/usr/bin/env bash
case "$1" in
  info)
    if [ "$2" = "--output" ]; then
      echo '{"id":"user-1"}'
      exit 0
    fi
    exit 0
    ;;
  logout) exit 0 ;;
  login) exit 0 ;;
  vault)
    if [ "$2" = "list" ] && [ "$4" = "json" ]; then
      echo '{"vaults":[{"name":"Private","vault_id":"vault-1","share_id":"share-1"}]}'
      exit 0
    fi
    exit 1
    ;;
  *) exit 0 ;;
esac
`,
      "utf8"
    )
    chmodSync(workspace.passCli, 0o755)
    const { result, output } = await captureStdout(() => invoke(["whoami"]))
    expect(Exit.isSuccess(result)).toBe(true)
    expect(output).toContain("user-1")
    expect(output).not.toContain("Email:")
  })

  it("fails inject when stdin cannot be read", async () => {
    workspace = makeWorkspace({ secretMap: "{}", stub: { infoExit: 0 } })
    const result = await withFailingStdin(() => invoke(["inject"]))
    expect(Exit.isFailure(result)).toBe(true)
  })

  it("fails read on invalid secret references", async () => {
    workspace = makeWorkspace({ secretMap: "{}", stub: { infoExit: 0 } })
    const result = await invoke(["read", "not-a-ref"])
    expect(Exit.isFailure(result)).toBe(true)
  })

  it("fails vault get for missing vaults", async () => {
    workspace = makeWorkspace({ secretMap: "{}", stub: { infoExit: 0 } })
    const result = await invoke(["vault", "get", "missing"])
    expect(Exit.isFailure(result)).toBe(true)
  })

  it("returns one vault as JSON", async () => {
    workspace = makeWorkspace({ secretMap: "{}", stub: { infoExit: 0 } })
    const { result, output } = await captureStdout(() =>
      invoke(["vault", "get", "Private", "--format", "json"])
    )
    expect(Exit.isSuccess(result)).toBe(true)
    expect(JSON.parse(output).name).toBe("Private")
  })

  it("returns an item title in human format", async () => {
    workspace = makeWorkspace({ secretMap: "{}", stub: { infoExit: 0 } })
    const { result, output } = await captureStdout(() =>
      invoke(["item", "get", "GitHub", "--vault", "Private"])
    )
    expect(Exit.isSuccess(result)).toBe(true)
    expect(output).toBe("GitHub\n")
  })

  it("reports read failures from an unavailable session", async () => {
    workspace = makeWorkspace({ secretMap: "{}", agentToken: null, stub: { infoExit: 1 } })
    const result = await invoke(["read", "op://Private/GitHub/password"])
    expect(Exit.isFailure(result)).toBe(true)
  })

  it("maps spawn failures while running a child command", async () => {
    workspace = makeWorkspace({ secretMap: "{}", stub: { infoExit: 0 } })
    process.env["PASS_CLI"] = "/nonexistent/pass-cli-xyz"
    const spawnFailureLayer = Layer.mergeAll(
      OnePasswordCompat.Default,
      Layer.succeed(PassSession, {
        ensure: Effect.void,
        baseEnv: {
          PROTON_PASS_SESSION_DIR: workspace.sessionDir,
          PROTON_PASS_AGENT_REASON: "OpenClaw establishing a Proton Pass session"
        }
      }),
      Paths.Default,
      Telemetry.Default
    ).pipe(Layer.provideMerge(NodeContext.layer), Layer.merge(StderrLoggerLive))
    const result = await Effect.runPromise(
      run(["node", "op", "run", "--", "echo", "hi"]).pipe(
        Effect.provide(spawnFailureLayer),
        Effect.exit
      )
    )
    expect(Exit.isFailure(result)).toBe(true)
  })

  it("runs a child command and substitutes op env references", async () => {
    workspace = makeWorkspace({ secretMap: "{}", stub: { infoExit: 0 } })
    const original = process.env["OPP_TEST_SECRET"]
    process.env["OPP_TEST_SECRET"] = "op://Private/GitHub/password"
    try {
      const { exitCode } = await withExitCode(() => invoke(["run", "--", "echo", "hi"]))
      expect(exitCode).toBe(0)
    } finally {
      if (original === undefined) delete process.env["OPP_TEST_SECRET"]
      else process.env["OPP_TEST_SECRET"] = original
    }
  })

  it("fails run when no command is given", async () => {
    workspace = makeWorkspace({ secretMap: "{}", stub: { infoExit: 0 } })
    const { exitCode } = await withExitCode(() => invoke(["run"]))
    expect(exitCode).toBe(64)
  })

  it("fails run when the session cannot be established", async () => {
    workspace = makeWorkspace({ secretMap: "{}", agentToken: null, stub: { infoExit: 1 } })
    const { exitCode } = await withExitCode(() => invoke(["run", "echo", "hi"]))
    expect(exitCode).toBe(69)
  })

  it("fails run when an op env reference is invalid", async () => {
    workspace = makeWorkspace({ secretMap: "{}", stub: { infoExit: 0 } })
    const original = process.env["OPP_TEST_SECRET"]
    process.env["OPP_TEST_SECRET"] = "op://bad/ref"
    try {
      const result = await invoke(["run", "echo", "hi"])
      expect(Exit.isFailure(result)).toBe(true)
    } finally {
      if (original === undefined) delete process.env["OPP_TEST_SECRET"]
      else process.env["OPP_TEST_SECRET"] = original
    }
  })

  it("propagates the child exit code", async () => {
    workspace = makeWorkspace({ secretMap: "{}", stub: { infoExit: 0, runExit: 7 } })
    const { exitCode } = await withExitCode(() => invoke(["run", "echo", "hi"]))
    expect(exitCode).toBe(7)
  })

  it("reports unsupported write and admin commands", async () => {
    workspace = makeWorkspace({ secretMap: "{}", stub: { infoExit: 0 } })
    const unsupported = await Promise.all([
      invoke(["item", "edit"]),
      invoke(["item", "delete"]),
      invoke(["item", "move"]),
      invoke(["item", "share"]),
      invoke(["document", "create"]),
      invoke(["document", "list"]),
      invoke(["events-api", "list"]),
      invoke(["signout"]),
      invoke(["user", "list"]),
      invoke(["plugin"]),
      invoke(["item", "create", "--format", "json"])
    ])
    expect(unsupported.every((result) => Exit.isFailure(result))).toBe(true)
  })

  it("formats sparse vault and item output defensively", async () => {
    workspace = makeWorkspace({ secretMap: "{}", stub: { infoExit: 0 } })
    const sparseLayer = Layer.mergeAll(
      Layer.succeed(OnePasswordCompat, {
        validateToken: () => Effect.void,
        listVaults: () => Effect.succeed([{}]),
        getVault: () => Effect.succeed({}),
        listItems: () =>
          Effect.succeed([
            {
              id: "item-1",
              vault: { id: "share-1" },
              category: "LOGIN" as const
            },
            {
              title: "Untitled item",
              vault: { id: "share-1" },
              category: "LOGIN" as const
            }
          ]),
        getItem: () =>
          Effect.succeed({
            vault: { id: "share-1" },
            category: "LOGIN",
            fields: [{ type: "TOTP", label: "totp" }]
          }),
        readSecretUri: () => Effect.succeed(Redacted.make("123456")),
        readSecret: () => Effect.succeed(Redacted.make("123456")),
        whoami: () => Effect.succeed({ accountUuid: "user-1" }),
        assertVaultAccess: () => Effect.void
      }),
      Layer.succeed(PassSession, {
        ensure: Effect.void,
        baseEnv: {
          PROTON_PASS_SESSION_DIR: workspace.sessionDir,
          PROTON_PASS_AGENT_REASON: "OpenClaw establishing a Proton Pass session"
        }
      }),
      Paths.Default,
      Telemetry.Default
    ).pipe(Layer.provideMerge(NodeContext.layer), Layer.merge(StderrLoggerLive))

    const runSparse = (args: ReadonlyArray<string>) =>
      Effect.runPromise(run(["node", "op", ...args]).pipe(Effect.provide(sparseLayer), Effect.exit))

    const vault = await captureStdout(() => runSparse(["vault", "get", "Private"]))
    expect(vault.output).toContain("ID:")

    const listed = await captureStdout(() =>
      runSparse(["item", "list", "--vault", "Private", "--format", "json"])
    )
    expect(JSON.parse(listed.output)).toHaveLength(2)

    const listedHuman = await captureStdout(() => runSparse(["item", "list", "--vault", "Private"]))
    expect(listedHuman.output).toContain("item-1\t\n")
    expect(listedHuman.output).toContain("\tUntitled item\n")

    const item = await captureStdout(() => runSparse(["item", "get", "GitHub", "--vault", "Private"]))
    expect(item.output).toBe("GitHub\n")

    const otp = await captureStdout(() =>
      runSparse(["item", "get", "GitHub", "--vault", "Private", "--otp"])
    )
    expect(otp.output.trim()).toBe("123456")
  })
})
