import assert from "node:assert/strict"
import { test } from "node:test"
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { buildElectron } from "./build-electron.mjs"

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), "buddy-desktop-build-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(path.join(root, "electron/dist"), { recursive: true })
  await writeFile(path.join(root, "electron/dist/main.js"), "previous main")
  await writeFile(
    path.join(root, "electron/dist/preload.cjs"),
    "previous preload"
  )
  return root
}

test("a failed preload leaves both previous Electron outputs intact", async (t) => {
  const root = await fixture(t)
  const failure = new Error("preload build failed")
  await assert.rejects(
    buildElectron({
      root,
      build: async (options) => {
        assert.equal(options.write, false)
        if (options.entryPoints[0].includes("preload")) throw failure
        return {
          outputFiles: [
            {
              path: path.join(root, "electron/dist/main.js"),
              contents: Buffer.from("new main"),
            },
          ],
        }
      },
    }),
    (error) => error === failure
  )
  assert.equal(
    await readFile(path.join(root, "electron/dist/main.js"), "utf8"),
    "previous main"
  )
  assert.equal(
    await readFile(path.join(root, "electron/dist/preload.cjs"), "utf8"),
    "previous preload"
  )
  assert.deepEqual(await readdir(path.join(root, "electron")), ["dist"])
})

test("a successful build replaces the entire output and removes staging artifacts", async (t) => {
  const root = await fixture(t)
  await writeFile(path.join(root, "electron/dist/obsolete.js"), "obsolete")
  await buildElectron({
    root,
    build: async (options) => ({
      outputFiles: [
        {
          path: options.outfile ?? path.join(options.outdir, "main.js"),
          contents: Buffer.from(
            options.format === "cjs" ? "new preload" : "new main"
          ),
        },
      ],
    }),
  })
  assert.equal(
    await readFile(path.join(root, "electron/dist/main.js"), "utf8"),
    "new main"
  )
  assert.equal(
    await readFile(path.join(root, "electron/dist/preload.cjs"), "utf8"),
    "new preload"
  )
  assert.deepEqual((await readdir(path.join(root, "electron/dist"))).sort(), [
    "main.js",
    "preload.cjs",
  ])
  assert.deepEqual(await readdir(path.join(root, "electron")), ["dist"])
})

test("esbuild bundles shared dependencies for both entries and preserves output on syntax errors", async (t) => {
  const root = await fixture(t)
  await mkdir(path.join(root, "src/shared"), { recursive: true })
  await writeFile(
    path.join(root, "src/shared/desktop.ts"),
    'export const channel = "desktop:project-workspace"'
  )
  await writeFile(
    path.join(root, "electron/main.ts"),
    'import { channel } from "../src/shared/desktop"; console.log(channel)'
  )
  await writeFile(
    path.join(root, "electron/preload.ts"),
    'import { channel } from "../src/shared/desktop"; exports.channel = channel'
  )
  await buildElectron({ root })
  const mainPath = path.join(root, "electron/dist/main.js")
  const preloadPath = path.join(root, "electron/dist/preload.cjs")
  const main = await readFile(mainPath, "utf8")
  const preload = await readFile(preloadPath, "utf8")
  assert.match(main, /desktop:project-workspace/)
  assert.match(preload, /desktop:project-workspace/)
  assert.ok(
    (await readdir(path.join(root, "electron/dist"))).includes("main.js.map")
  )

  await writeFile(path.join(root, "electron/preload.ts"), "invalid syntax ???")
  await assert.rejects(buildElectron({ root }))
  assert.equal(await readFile(mainPath, "utf8"), main)
  assert.equal(await readFile(preloadPath, "utf8"), preload)
  assert.ok(
    !(await readdir(path.join(root, "electron"))).some((file) =>
      file.startsWith(".dist-build-")
    )
  )
})
