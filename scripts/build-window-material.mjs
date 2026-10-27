import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const sourcePath = path.join(
  projectRoot,
  "electron/native/window-material/WindowMaterial.m"
)
export const windowMaterialAddonPath = path.join(
  projectRoot,
  ".electron-runtime/window-material/fba-window-material.node"
)

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    encoding: "utf8",
    env: process.env,
  })
  if (result.status === 0) return
  const details = [result.stdout, result.stderr]
    .filter(Boolean)
    .join("\n")
    .trim()
  throw new Error(
    `${command} failed (${result.status ?? "unknown"})${details ? `: ${details}` : ""}`
  )
}

function archArguments(arch) {
  if (arch === "arm64") return ["-arch", "arm64"]
  if (arch === "x64") return ["-arch", "x86_64"]
  if (arch === "universal") return ["-arch", "arm64", "-arch", "x86_64"]
  throw new Error(`Unsupported window material architecture: ${arch}`)
}

export async function buildWindowMaterialAddon({
  arch = "universal",
  quiet = false,
} = {}) {
  if (process.platform !== "darwin") return null

  const metadataPath = `${windowMaterialAddonPath}.build.json`
  const fingerprint = createHash("sha256")
    .update(arch)
    .update(await readFile(sourcePath))
    .update(await readFile(fileURLToPath(import.meta.url)))
    .digest("hex")
  try {
    const metadata = JSON.parse(await readFile(metadataPath, "utf8"))
    if (metadata.fingerprint === fingerprint) {
      run("codesign", ["--verify", "--strict", windowMaterialAddonPath])
      return windowMaterialAddonPath
    }
  } catch {
    // 缓存缺失或签名无效时重新编译当前源文件
  }
  const temporaryDirectory = await mkdtemp(
    path.join(tmpdir(), "fba-window-material-")
  )
  const temporaryOutput = path.join(
    temporaryDirectory,
    "fba-window-material.node"
  )
  try {
    run("xcrun", [
      "clang",
      "-x",
      "objective-c",
      "-fobjc-arc",
      "-O2",
      "-Wall",
      "-Wextra",
      "-Werror",
      ...archArguments(arch),
      "-mmacosx-version-min=12.3",
      "-bundle",
      "-undefined",
      "dynamic_lookup",
      "-framework",
      "AppKit",
      sourcePath,
      "-o",
      temporaryOutput,
    ])
    run("codesign", [
      "--force",
      "--sign",
      "-",
      "--timestamp=none",
      temporaryOutput,
    ])
    await mkdir(path.dirname(windowMaterialAddonPath), { recursive: true })
    await copyFile(temporaryOutput, `${windowMaterialAddonPath}.tmp`)
    await rename(`${windowMaterialAddonPath}.tmp`, windowMaterialAddonPath)
    await writeFile(metadataPath, JSON.stringify({ fingerprint, arch }))
    if (!quiet) {
      console.info(`window material addon: ${windowMaterialAddonPath}`)
    }
    return windowMaterialAddonPath
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true })
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await buildWindowMaterialAddon()
}
