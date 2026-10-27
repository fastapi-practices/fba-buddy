import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { test } from "node:test"
import { setTimeout as delay } from "node:timers/promises"

test(
  "development runner reloads native sources, retains the client on build errors, and cleans up its children",
  {
    skip:
      process.platform === "win32" && "fixture executable uses POSIX shebang",
    timeout: 15_000,
  },
  async (t) => {
    const root = await mkdtemp(path.join(tmpdir(), "buddy-desktop-runner-"))
    t.after(() => rm(root, { recursive: true, force: true }))
    for (const directory of [
      "scripts",
      "electron",
      "src/shared",
      "src/features",
      "bin",
      "node_modules",
    ]) {
      await mkdir(path.join(root, directory), { recursive: true })
    }
    for (const filename of [
      "dev-desktop.mjs",
      "build-electron.mjs",
      "desktop-dev-rebuild.mjs",
    ]) {
      await copyFile(
        new URL(filename, import.meta.url),
        path.join(root, "scripts", filename)
      )
    }
    await writeFile(
      path.join(root, "scripts/build-window-material.mjs"),
      "export async function buildWindowMaterialAddon() {}"
    )
    const writeModule = async (name, source) => {
      const directory = path.join(root, "node_modules", name)
      await mkdir(directory)
      await writeFile(
        path.join(directory, "package.json"),
        JSON.stringify({ type: "module", exports: "./index.js" })
      )
      await writeFile(path.join(directory, "index.js"), source)
    }
    const log = path.join(root, "events.log")
    const append = `import { appendFileSync } from "node:fs"; const log = (event) => appendFileSync(${JSON.stringify(log)}, JSON.stringify({ event, pid: process.pid }) + "\\n");`
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ type: "module", main: "electron/dist/main.js" })
    )
    const mainSource = `${append} log("electron-start"); process.on("SIGTERM", () => { log("electron-stop"); process.exit(0) }); setInterval(() => {}, 1000);`
    await writeFile(path.join(root, "electron/main.ts"), mainSource)
    await writeFile(path.join(root, "electron/preload.ts"), "// preload")
    await writeFile(path.join(root, "src/shared/desktop.ts"), "// shared")
    await writeModule("electron", "export default process.execPath")
    await writeModule("wait-on", "export default async () => {}")
    await writeModule(
      "esbuild",
      `
import { readFile } from "node:fs/promises"
import path from "node:path"
export async function build(options) {
  const source = await readFile(path.join(options.absWorkingDir, options.entryPoints[0]), "utf8")
  if (source.includes("INVALID")) throw new Error("fixture compilation failed")
  return { outputFiles: [{ path: options.outfile ?? path.join(options.outdir, "main.js"), contents: Buffer.from(source) }] }
}
`
    )
    await writeFile(
      path.join(root, "bin/pnpm"),
      `#!${process.execPath}\n${append} log("vite-start"); process.on("SIGTERM", () => { log("vite-stop"); process.exit(0) }); setInterval(() => {}, 1000);`,
      { mode: 0o755 }
    )

    let output = ""
    const runner = spawn(process.execPath, ["scripts/dev-desktop.mjs"], {
      cwd: root,
      env: {
        ...process.env,
        PATH: `${path.join(root, "bin")}${path.delimiter}${process.env.PATH}`,
      },
      stdio: ["ignore", "pipe", "pipe"],
    })
    runner.stdout.on("data", (chunk) => {
      output += chunk
    })
    runner.stderr.on("data", (chunk) => {
      output += chunk
    })
    const closed = new Promise((resolve) =>
      runner.on("close", (code) => resolve(code))
    )
    t.after(async () => {
      if (runner.exitCode === null) runner.kill("SIGTERM")
      await closed
    })
    const events = async () => {
      try {
        return (await readFile(log, "utf8"))
          .trim()
          .split("\n")
          .filter(Boolean)
          .map((line) => JSON.parse(line))
      } catch (error) {
        if (error.code === "ENOENT") return []
        throw error
      }
    }
    const count = async (name) =>
      (await events()).filter((event) => event.event === name).length
    const waitFor = async (condition) => {
      const deadline = Date.now() + 4_000
      while (
        !(await condition()) &&
        Date.now() < deadline &&
        runner.exitCode === null
      )
        await delay(20)
      assert.ok(await condition(), output)
    }
    await waitFor(
      async () =>
        (await count("electron-start")) === 1 &&
        (await count("vite-start")) === 1
    )
    await writeFile(path.join(root, "src/features/ui.tsx"), "// UI only")
    await writeFile(path.join(root, "electron/main.test.ts"), "// test only")
    await delay(350)
    assert.equal(await count("electron-start"), 1)
    await writeFile(
      path.join(root, "electron/preload.ts"),
      "// preload updated"
    )
    await waitFor(async () => (await count("electron-start")) === 2)
    assert.equal(await count("vite-start"), 1)
    assert.equal(await count("electron-stop"), 1)
    await writeFile(
      path.join(root, "src/shared/desktop.ts"),
      "// shared updated"
    )
    await waitFor(async () => (await count("electron-start")) === 3)

    const compiledMain = await readFile(
      path.join(root, "electron/dist/main.js"),
      "utf8"
    )
    await writeFile(path.join(root, "electron/preload.ts"), "INVALID")
    await waitFor(() => output.includes("当前桌面窗口继续运行"))
    assert.equal(await count("electron-start"), 3)
    assert.equal(await count("electron-stop"), 2)
    assert.equal(
      await readFile(path.join(root, "electron/dist/main.js"), "utf8"),
      compiledMain
    )
    await writeFile(path.join(root, "electron/preload.ts"), "// fixed preload")
    await waitFor(async () => (await count("electron-start")) === 4)
    runner.kill("SIGTERM")
    assert.equal(await closed, 0)
    assert.equal(await count("electron-stop"), 4)
    assert.equal(await count("vite-stop"), 1)
    for (const { pid } of await events()) {
      assert.throws(
        () => process.kill(pid, 0),
        (error) => error.code === "ESRCH"
      )
    }
  }
)
