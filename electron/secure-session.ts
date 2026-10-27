import { app, safeStorage } from "electron"
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import path from "node:path"

import type { DesktopSessionPayload } from "../src/shared/desktop"

let memorySession: DesktopSessionPayload | null | undefined

function sessionFilePath() {
  return path.join(app.getPath("userData"), "session.bin")
}

function isPayload(value: unknown): value is DesktopSessionPayload {
  if (!value || typeof value !== "object") {
    return false
  }
  const payload = value as DesktopSessionPayload
  return (
    (payload.accessToken === null || typeof payload.accessToken === "string") &&
    (payload.accessTokenExpireTime === null ||
      typeof payload.accessTokenExpireTime === "string") &&
    (payload.sessionUuid === null || typeof payload.sessionUuid === "string")
  )
}

export function loadSecureSession(): DesktopSessionPayload | null {
  if (memorySession !== undefined) return memorySession
  if (!safeStorage.isEncryptionAvailable()) return null
  try {
    const bytes = readFileSync(sessionFilePath())
    const json = safeStorage.decryptString(bytes)
    const parsed: unknown = JSON.parse(json)
    return isPayload(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function saveSecureSession(payload: DesktopSessionPayload) {
  if (!payload.accessToken || !payload.user) {
    clearSecureSession()
    return
  }
  memorySession = payload
  if (!safeStorage.isEncryptionAvailable()) return
  mkdirSync(app.getPath("userData"), { recursive: true })
  const json = JSON.stringify(payload)
  const bytes = safeStorage.encryptString(json)
  writeFileSync(sessionFilePath(), bytes, { mode: 0o600 })
  chmodSync(sessionFilePath(), 0o600)
}

export function clearSecureSession() {
  memorySession = null
  try {
    rmSync(sessionFilePath(), { force: true })
  } catch {
    // already gone
  }
}
