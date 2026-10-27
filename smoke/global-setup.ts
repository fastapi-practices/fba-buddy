import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"

export default function globalSetup() {
  const root = fileURLToPath(new URL("../", import.meta.url))
  execFileSync(process.execPath, ["scripts/build-electron.mjs"], {
    cwd: root,
    stdio: "inherit",
  })
  if (process.platform === "darwin") {
    execFileSync(process.execPath, ["scripts/build-window-material.mjs"], {
      cwd: root,
      stdio: "inherit",
    })
  }
}
