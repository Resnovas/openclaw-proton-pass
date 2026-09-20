/**
 * Extend the default JavaScript version actions so `nx release` also rewrites
 * `openclaw.plugin.json` and the OpenClaw install metadata in package.json.
 */
import JsVersionActions, {
  afterAllProjectsVersioned
} from "@nx/js/src/release/version-actions"
import { readJson, writeJson, type Tree } from "@nx/devkit"
import { join } from "node:path"

export { afterAllProjectsVersioned }

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
