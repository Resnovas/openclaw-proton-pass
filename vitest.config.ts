/*
 * Project: openclaw-proton-pass
 * File: vitest.config.ts
 * Last Modified: 2026-09-18
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

import { existsSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import type { Plugin } from "vite"
import { defineConfig } from "vitest/config"

const root = dirname(fileURLToPath(import.meta.url))

/**
 * Resolve NodeNext-style `./thing.js` imports to their TypeScript source.
 *
 * The sources compile under `module: NodeNext`, which requires the `.js`
 * extension in relative imports. Without this the tests would have to import
 * the built output, and coverage would measure `dist` rather than the code
 * under review.
 */
const nodeNextSource: Plugin = {
  name: "nodenext-source-resolution",
  enforce: "pre",
  resolveId(source, importer) {
    if (importer === undefined || !source.startsWith(".") || !source.endsWith(".js")) {
      return null
    }
    const candidate = resolve(dirname(importer), source.replace(/\.js$/, ".ts"))
    return existsSync(candidate) ? candidate : null
  }
}

const lib = (name: string) => resolve(root, `libs/${name}/src/index.ts`)
const app = (name: string) => resolve(root, `apps/${name}/src/app.ts`)

export default defineConfig({
  plugins: [nodeNextSource],
  resolve: {
    alias: {
      "@resnovas/opp-domain": lib("domain"),
      "@resnovas/opp-config": lib("config"),
      "@resnovas/opp-pass-cli": lib("pass-cli"),
      "@resnovas/opp-telemetry": lib("telemetry"),
      "@resnovas/opp-onepassword-contract": lib("onepassword-contract"),
      "@resnovas/opp-onepassword-compat": lib("onepassword-compat"),
      "@resnovas/opp-op": app("op"),
      "@resnovas/opp-connect": app("connect")
    }
  },
  test: {
    include: ["tests/**/*.spec.ts"],
    environment: "node",
    // Telemetry ships on; the suite must not report to the real project.
    setupFiles: ["tests/helpers/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      reportsDirectory: "coverage",
      include: ["libs/*/src/**/*.ts", "apps/*/src/**/*.ts"],
      exclude: [
        // Barrel files contain only re-exports.
        "**/src/index.ts",
        // Entry points exist to call runMain and nothing else. Importing one
        // would start the program, so they cannot be instrumented in process;
        // they are exercised instead by the subprocess tests, which run the
        // real built binaries end to end.
        "apps/*/src/main.ts"
      ],
      thresholds: { lines: 100, functions: 100, statements: 100, branches: 100 }
    }
  }
})
