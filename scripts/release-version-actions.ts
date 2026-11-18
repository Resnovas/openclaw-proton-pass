/**
 * Extend the default JavaScript version actions so `nx release` also rewrites
 * `openclaw.plugin.json` and the OpenClaw install metadata in package.json.
 */
import { createRequire } from "node:module"
import type { Tree } from "nx/src/generators/tree"
import { join } from "node:path"

// @nx/js ships this module as CommonJS with the class on `exports.default`;
// an ESM default import under Node's type stripping would receive the whole
// exports object instead, so load it through require.
const require = createRequire(import.meta.url)
const { default: JsVersionActions, afterAllProjectsVersioned } = require(
  "@nx/js/src/release/version-actions"
) as typeof import("@nx/js/src/release/version-actions")

export { afterAllProjectsVersioned }

// Plain JSON helpers keep this file loadable under Node's type stripping,
// which cannot resolve @nx/devkit because it is not a direct dependency.
const readJson = (tree: Tree, path: string): unknown => JSON.parse(tree.read(path, "utf-8") ?? "")
const writeJson = (tree: Tree, path: string, value: unknown): void =>
  tree.write(path, `${JSON.stringify(value, null, 2)}\n`)

const syncPluginManifest = (
  tree: Tree,
  projectRoot: string,
  version: string,
  packageName: string
): ReadonlyArray<string> => {
  const logs: Array<string> = []
  const manifestPath = join(projectRoot, "openclaw.plugin.json")

  if (tree.exists(manifestPath)) {
    const manifest = readJson(tree, manifestPath) as Record<string, unknown>
    manifest["version"] = version
    writeJson(tree, manifestPath, manifest)
    logs.push(`✍️  New version ${version} written to manifest: ${manifestPath}`)
  }

  const packagePath = join(projectRoot, "package.json")
  const pkg = readJson(tree, packagePath) as {
    name: string
    openclaw?: {
      install?: Record<string, unknown>
    }
  }
  const openclaw = (pkg.openclaw ??= {})
  const install = (openclaw.install ??= {})
  install["npmSpec"] = `${packageName}@${version}`
  writeJson(tree, packagePath, pkg)

  return logs
}

export default class OpenClawVersionActions extends JsVersionActions {
  override async updateProjectVersion(tree: Tree, newVersion: string): Promise<Array<string>> {
    const logMessages = await super.updateProjectVersion(tree, newVersion)

    if (this.projectGraphNode.name !== "openclaw-proton-pass") {
      return logMessages
    }

    const packagePath = join(this.projectGraphNode.data.root, "package.json")
    const pkg = readJson(tree, packagePath) as { name: string }

    return [
      ...logMessages,
      ...syncPluginManifest(
        tree,
        this.projectGraphNode.data.root,
        newVersion,
        pkg.name
      )
    ]
  }
}
