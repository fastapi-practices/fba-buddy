export type ManagedRuntimeKind = "node" | "python"
type RuntimePlatform = "darwin" | "linux"
type RuntimeArchitecture = "arm64" | "x64"
export type RuntimeArchive = {
  kind: ManagedRuntimeKind
  version: string
  platform: RuntimePlatform
  arch: RuntimeArchitecture
  url: string
  sha256: string
  root: string
  executable: string
}

const NODE_VERSION = "22.22.0"
const PYTHON_VERSION = "3.12.11"
const PYTHON_RELEASE_ASSETS = {
  "darwin-arm64": 283798545,
  "darwin-x64": 283798596,
  "linux-arm64": 283798554,
  "linux-x64": 283798609,
} as const

// Pins were obtained from Node's official SHASUMS256.txt and immutable GitHub release asset digests.
const NODE_SHA256 = {
  "darwin-arm64":
    "5ed4db0fcf1eaf84d91ad12462631d73bf4576c1377e192d222e48026a902640",
  "darwin-x64":
    "5ea50c9d6dea3dfa3abb66b2656f7a4e1c8cef23432b558d45fb538c7b5dedce",
  "linux-arm64":
    "25ba95dfb96871fa2ef977f11f95ea90818c8fa15c0f2110771db08d4ba423be",
  "linux-x64":
    "c33c39ed9c80deddde77c960d00119918b9e352426fd604ba41638d6526a4744",
} as const
const PYTHON_SHA256 = {
  "darwin-arm64":
    "fabb5fd4de54c68ce7e70d19fb08127549da5787cd38a34d00000749f4fde478",
  "darwin-x64":
    "896add7763faa8012ba6a37346718b32ed0ac041230979cfe8fc802fbb0daeef",
  "linux-arm64":
    "b3df3317e101cadcc56f08912fe0f68c5fbe1649a035585d650891ecd60a7d0a",
  "linux-x64":
    "98229938166f51deff81b00d71455fac84a57290b71089bd5fe673738557f053",
} as const

export function getRuntimeArchive(
  kind: ManagedRuntimeKind,
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch
): RuntimeArchive | undefined {
  if (
    (kind !== "node" && kind !== "python") ||
    (platform !== "darwin" && platform !== "linux") ||
    (arch !== "arm64" && arch !== "x64")
  )
    return undefined
  const key = `${platform}-${arch}` as keyof typeof NODE_SHA256
  if (kind === "node") {
    const root = `node-v${NODE_VERSION}-${platform}-${arch}`
    return {
      kind,
      version: NODE_VERSION,
      platform,
      arch,
      root,
      executable: "bin/node",
      sha256: NODE_SHA256[key],
      url: `https://nodejs.org/dist/v${NODE_VERSION}/${root}.tar.gz`,
    }
  }
  return {
    kind,
    version: PYTHON_VERSION,
    platform,
    arch,
    root: "python",
    executable: "bin/python3.12",
    sha256: PYTHON_SHA256[key],
    url: `https://api.github.com/repos/astral-sh/python-build-standalone/releases/assets/${PYTHON_RELEASE_ASSETS[key]}`,
  }
}
