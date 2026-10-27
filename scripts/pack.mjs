import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"

process.env.CSC_IDENTITY_AUTO_DISCOVERY = "false"
delete process.env.CSC_LINK
delete process.env.CSC_KEY_PASSWORD
delete process.env.APPLE_ID
delete process.env.APPLE_APP_SPECIFIC_PASSWORD
delete process.env.APPLE_TEAM_ID

const args = process.argv.slice(2)
const publishIndex = args.indexOf("--publish")
const publish = publishIndex >= 0 ? args[publishIndex + 1] : "never"
const passthrough = args.filter(
  (arg, index) => arg !== "--publish" && args[index - 1] !== "--publish"
)
const builder = fileURLToPath(
  new URL("../node_modules/electron-builder/cli.js", import.meta.url)
)

const child = spawn(
  process.execPath,
  [builder, "--publish", publish, ...passthrough],
  {
    stdio: "inherit",
    env: process.env,
  }
)

child.on("exit", (code) => {
  process.exit(code ?? 1)
})
