import { defineConfig } from "@playwright/test"

const port = 4174
const origin = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: "smoke",
  testMatch: "**/*.smoke.ts",
  globalSetup: "./smoke/global-setup.ts",
  outputDir: "test-results/smoke",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: "list",
  use: {
    baseURL: origin,
    headless: true,
  },
  webServer: {
    command: `./node_modules/.bin/vite --host 127.0.0.1 --port ${port} --strictPort`,
    url: origin,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [{ name: "desktop-smoke" }],
})
