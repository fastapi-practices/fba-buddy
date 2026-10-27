import assert from "node:assert/strict"
import { test } from "node:test"
import { setImmediate } from "node:timers/promises"
import { setTimeout as delay } from "node:timers/promises"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  createDesktopRebuilder,
  isDesktopSource,
  watchDesktopSources,
} from "./desktop-dev-rebuild.mjs"

const deferred = () => {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function timerHarness(t, overrides = {}) {
  t.mock.timers.enable({ apis: ["setTimeout"] })
  const builds = []
  let restarts = 0
  const errors = []
  const rebuilder = createDesktopRebuilder({
    build: () => {
      const build = deferred()
      builds.push(build)
      return build.promise
    },
    restart: () => {
      restarts += 1
    },
    onError: (error) => errors.push(error),
    ...overrides,
  })
  t.after(() => rebuilder.dispose())
  return { rebuilder, builds, errors, restarts: () => restarts }
}

test("only Electron and shared production sources trigger rebuilds", () => {
  for (const filename of [
    "electron/main.ts",
    "electron/preload.ts",
    "electron/nested/ipc.mjs",
    "src/shared/desktop.ts",
    "src\\shared\\workspace.ts",
  ])
    assert.equal(isDesktopSource(filename), true, filename)
  for (const filename of [
    "src/features/chat/index.tsx",
    "electron/dist/main.js",
    "electron/.dist-build-123/preload.cjs",
    "electron/main.test.ts",
    "electron/main.spec.ts",
    "src/shared/__tests__/desktop.ts",
    "electron/dist/main.js.map",
  ])
    assert.equal(isDesktopSource(filename), false, filename)
})

test("coalesces consecutive saves into one build and one restart", async (t) => {
  const { rebuilder, builds, restarts } = timerHarness(t)
  rebuilder.request()
  t.mock.timers.tick(100)
  rebuilder.request()
  t.mock.timers.tick(199)
  assert.equal(builds.length, 0)
  t.mock.timers.tick(1)
  assert.equal(builds.length, 1)
  builds[0].resolve()
  await setImmediate()
  assert.equal(restarts(), 1)
})

test("retains the current client after failure and retries on the next save", async (t) => {
  const { rebuilder, builds, errors, restarts } = timerHarness(t)
  rebuilder.request()
  t.mock.timers.tick(200)
  const failure = new Error("preload compilation failed")
  builds[0].reject(failure)
  await setImmediate()
  assert.equal(restarts(), 0)
  assert.deepEqual(errors, [failure])
  rebuilder.request()
  t.mock.timers.tick(200)
  builds[1].resolve()
  await setImmediate()
  assert.equal(restarts(), 1)
})

test("does not restart stale output when sources change during a build", async (t) => {
  const { rebuilder, builds, restarts } = timerHarness(t)
  rebuilder.request()
  t.mock.timers.tick(200)
  rebuilder.request()
  rebuilder.request()
  t.mock.timers.tick(200)
  assert.equal(builds.length, 1)
  builds[0].resolve()
  await setImmediate()
  assert.equal(builds.length, 2)
  assert.equal(restarts(), 0)
  builds[1].resolve()
  await setImmediate()
  assert.equal(restarts(), 1)
})

test("waits for the latest debounce before rebuilding after an in-flight build", async (t) => {
  const { rebuilder, builds, restarts } = timerHarness(t)
  rebuilder.request()
  t.mock.timers.tick(200)
  rebuilder.request()
  builds[0].resolve()
  await setImmediate()
  assert.equal(builds.length, 1)
  assert.equal(restarts(), 0)
  t.mock.timers.tick(200)
  assert.equal(builds.length, 2)
  builds[1].resolve()
})

test("shutdown cancels scheduled builds and prevents in-flight restarts", async (t) => {
  const { rebuilder, builds, restarts } = timerHarness(t)
  rebuilder.request()
  t.mock.timers.tick(200)
  rebuilder.request()
  const disposed = rebuilder.dispose()
  builds[0].resolve()
  await disposed
  rebuilder.request()
  t.mock.timers.tick(1_000)
  assert.equal(builds.length, 1)
  assert.equal(restarts(), 0)
})

test("native watcher ignores build output and UI changes, tracks new nested sources, and closes", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "buddy-desktop-watch-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  for (const directory of [
    "electron/dist",
    "electron/.dist-build-test",
    "src/shared",
    "src/features/chat",
  ])
    await mkdir(path.join(root, directory), { recursive: true })

  let changes = 0
  const errors = []
  const close = watchDesktopSources({
    root,
    onChange: () => {
      changes += 1
    },
    onError: (error) => errors.push(error),
  })
  t.after(close)
  for (const filename of [
    "electron/dist/main.js",
    "electron/.dist-build-test/preload.cjs",
    "electron/main.test.ts",
    "src/features/chat/index.tsx",
  ])
    await writeFile(path.join(root, filename), "ignored")
  await delay(100)
  assert.equal(changes, 0)

  const waitForChange = async (before) => {
    const deadline = Date.now() + 2_000
    while (changes <= before && Date.now() < deadline) await delay(10)
    assert.ok(changes > before)
    assert.deepEqual(errors, [])
  }
  await writeFile(path.join(root, "electron/main.ts"), "main")
  await waitForChange(0)
  const beforeShared = changes
  await mkdir(path.join(root, "src/shared/nested"))
  await writeFile(path.join(root, "src/shared/nested/ipc.ts"), "shared")
  await waitForChange(beforeShared)

  close()
  const beforeClose = changes
  await writeFile(path.join(root, "electron/main.ts"), "after shutdown")
  await delay(100)
  assert.equal(changes, beforeClose)
})
