import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  existsSync,
} from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ directory: "", available: true }))
vi.mock("electron", () => ({
  app: { getPath: () => mocks.directory },
  safeStorage: {
    isEncryptionAvailable: () => mocks.available,
    encryptString: (value: string) => Buffer.from("encrypted:" + value),
    decryptString: (value: Buffer) => {
      const encoded = value.toString("utf8")
      if (!encoded.startsWith("encrypted:")) throw new Error("not encrypted")
      return encoded.slice("encrypted:".length)
    },
  },
}))
const payload = {
  accessToken: "token",
  accessTokenExpireTime: null,
  sessionUuid: "session",
  user: { id: 1 },
}
beforeEach(() => {
  vi.resetModules()
  mocks.directory = mkdtempSync(path.join(os.tmpdir(), "buddy-secure-session-"))
  mocks.available = true
})
afterEach(() => rmSync(mocks.directory, { recursive: true, force: true }))

it("persists an encrypted session and reads it after restarting the module", async () => {
  const first = await import("./secure-session")
  first.saveSecureSession(payload)
  expect(readFileSync(path.join(mocks.directory, "session.bin"), "utf8")).toBe(
    "encrypted:" + JSON.stringify(payload)
  )
  vi.resetModules()
  const reopened = await import("./secure-session")
  expect(reopened.loadSecureSession()).toEqual(payload)
  reopened.clearSecureSession()
  expect(reopened.loadSecureSession()).toBeNull()
  expect(existsSync(path.join(mocks.directory, "session.bin"))).toBe(false)
})

it("keeps login usable in memory when encryption is unavailable without creating plaintext", async () => {
  mocks.available = false
  const session = await import("./secure-session")
  session.saveSecureSession(payload)
  expect(session.loadSecureSession()).toEqual(payload)
  expect(existsSync(path.join(mocks.directory, "session.bin"))).toBe(false)
  vi.resetModules()
  expect((await import("./secure-session")).loadSecureSession()).toBeNull()
})

it("preserves the encrypted session on disk while encryption is unavailable", async () => {
  const file = path.join(mocks.directory, "session.bin")
  const encrypted = "encrypted:" + JSON.stringify(payload)
  writeFileSync(file, encrypted)
  mocks.available = false
  const session = await import("./secure-session")
  expect(session.loadSecureSession()).toBeNull()
  const updated = { ...payload, accessToken: "replacement-token" }
  session.saveSecureSession(updated)
  expect(session.loadSecureSession()).toEqual(updated)
  expect(readFileSync(file, "utf8")).toBe(encrypted)
  session.clearSecureSession()
  expect(existsSync(file)).toBe(false)
})

it("removes an older encrypted session on logout even after encryption becomes unavailable", async () => {
  const session = await import("./secure-session")
  session.saveSecureSession(payload)
  const file = path.join(mocks.directory, "session.bin")
  expect(existsSync(file)).toBe(true)
  mocks.available = false
  session.saveSecureSession({
    accessToken: null,
    accessTokenExpireTime: null,
    sessionUuid: null,
    user: null,
  })
  expect(existsSync(file)).toBe(false)
  expect(session.loadSecureSession()).toBeNull()
  mocks.available = true
  vi.resetModules()
  expect((await import("./secure-session")).loadSecureSession()).toBeNull()
})
