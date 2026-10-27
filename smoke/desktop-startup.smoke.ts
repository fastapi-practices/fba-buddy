import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"

import { _electron as electron, expect, test } from "@playwright/test"

import {
  desktopSmokeBootstrap,
  desktopSmokeEnvironment,
} from "./desktop-launch"

test("desktop app starts and mounts the renderer", async ({ baseURL }) => {
  const profile = await mkdtemp(path.join(tmpdir(), "fba-smoke-"))
  const bootstrap = path.join(profile, "desktop-smoke-main.mjs")
  await writeFile(
    bootstrap,
    `${desktopSmokeBootstrap(profile)}
await import(${JSON.stringify(pathToFileURL(path.resolve("electron/dist/main.js")).href)})
`
  )

  const app = await electron.launch({
    args: [
      bootstrap,
      `--user-data-dir=${profile}`,
      ...(process.env.CI && process.platform === "linux" ? ["--no-sandbox"] : []),
    ],
    env: desktopSmokeEnvironment(baseURL!),
  })

  try {
    const page = await app.firstWindow()
    const pageErrors: string[] = []
    page.on("pageerror", (error) => pageErrors.push(error.message))
    await page.waitForLoadState("domcontentloaded")
    await expect(page.locator("#root > *").first()).toBeVisible()
    expect(pageErrors).toEqual([])
  } finally {
    await app.close()
    await rm(profile, { recursive: true, force: true })
  }
})
