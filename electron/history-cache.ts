import {
  chmodSync,
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  realpathSync,
} from "node:fs"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"
import type {
  HistoryCacheRequest,
  HistoryCacheSnapshot,
} from "../src/shared/history-cache"
import { accountSourceHash } from "./account-source"

const MAX_SNAPSHOT_BYTES = 32 * 1024 * 1024
const MAX_SCOPE_ENTRIES = 500

function historyPath(input: string) {
  if (
    typeof input !== "string" ||
    input.length > 4096 ||
    !/^\/(?!\/)/.test(input) ||
    /[\\\0\r\n#]/.test(input)
  )
    throw new Error("历史缓存路径无效")
  const pathname = decodeURIComponent(input.split("?")[0])
  if (
    !/^\/conversations(?:\/(?:search|[a-zA-Z0-9_-]{1,128}(?:\/messages(?:\/search|\/\d+\/versions)?|\/plan)?))?$/.test(
      pathname
    )
  )
    throw new Error("此接口不支持历史缓存")
  const url = new URL(input, "http://cache")
  url.searchParams.sort()
  const match = pathname.match(/^\/conversations\/([^/]+)/)
  return {
    key: pathname + url.search,
    conversationId: match && match[1] !== "search" ? match[1] : null,
  }
}

function offlineSnapshot(value: unknown): unknown {
  if (Array.isArray(value))
    return value.map(offlineSnapshot).filter((item) => item !== undefined)
  if (!value || typeof value !== "object") return value
  const row = value as Record<string, unknown>
  if (
    row.name === "buddy.coding.approval" &&
    row.value &&
    typeof row.value === "object"
  )
    return undefined
  const result: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    if (
      [
        "current_run_id",
        "current_run_start",
        "client_run_id",
        "clientRunId",
        "pendingApproval",
        "approvalRequestId",
        "interruptId",
        "inputRequests",
        "input_requests",
      ].includes(key)
    )
      continue
    if (
      key === "is_generating" ||
      (key === "pending" && row.role === "assistant")
    )
      result[key] = false
    else if (
      ["message_type", "messageType"].includes(key) &&
      item === "suspended"
    )
      result[key] = "interrupted"
    else if (
      key === "status" &&
      (row.role === "assistant" ||
        "pendingApproval" in row ||
        "interruptId" in row) &&
      ["running", "streaming", "awaiting-approval"].includes(String(item))
    )
      result[key] = "interrupted"
    else result[key] = offlineSnapshot(item)
  }
  return result
}

export class HistoryCache {
  private readonly db: DatabaseSync
  private closed = false

  constructor(directory: string) {
    mkdirSync(directory, { recursive: true, mode: 0o700 })
    const info = lstatSync(directory)
    if (
      !info.isDirectory() ||
      info.isSymbolicLink() ||
      (process.getuid && info.uid !== process.getuid())
    )
      throw new Error("历史缓存目录无效")
    chmodSync(directory, 0o700)
    const file = path.join(realpathSync(directory), "history.sqlite")
    const descriptor = openSync(
      file,
      constants.O_RDWR | constants.O_CREAT | constants.O_NOFOLLOW,
      0o600
    )
    try {
      const entry = fstatSync(descriptor)
      if (
        !entry.isFile() ||
        entry.nlink !== 1 ||
        (process.getuid && entry.uid !== process.getuid())
      )
        throw new Error("历史缓存文件无效")
    } finally {
      closeSync(descriptor)
    }
    chmodSync(file, 0o600)
    this.db = new DatabaseSync(file)
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = FULL;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS snapshots (
        scope TEXT NOT NULL,
        path TEXT NOT NULL,
        conversation_id TEXT,
        value TEXT NOT NULL,
        cached_at TEXT NOT NULL,
        PRIMARY KEY (scope, path)
      );
      CREATE TABLE IF NOT EXISTS deleted_conversations (
        scope TEXT NOT NULL,
        conversation_id TEXT NOT NULL,
        PRIMARY KEY (scope, conversation_id)
      );
    `)
  }

  request(request: HistoryCacheRequest): HistoryCacheSnapshot | null {
    if (this.closed) throw new Error("历史缓存已关闭")
    const scope = accountSourceHash(request.source)
    if (request.action === "get" || request.action === "put") {
      const entry = historyPath(request.path)
      if (entry.conversationId && this.deleted(scope, entry.conversationId))
        return null
      if (request.action === "get") {
        const row = this.db
          .prepare(
            "SELECT value, cached_at FROM snapshots WHERE scope = ? AND path = ?"
          )
          .get(scope, entry.key)
        return row
          ? {
              value: offlineSnapshot(JSON.parse(String(row.value))),
              cachedAt: String(row.cached_at),
            }
          : null
      }
      const encoded = JSON.stringify(request.value)
      if (
        encoded === undefined ||
        Buffer.byteLength(encoded) > MAX_SNAPSHOT_BYTES
      )
        throw new Error("历史缓存快照过大或无效")
      if (!entry.conversationId) {
        const deleted = new Set(
          this.db
            .prepare(
              "SELECT conversation_id FROM deleted_conversations WHERE scope = ?"
            )
            .all(scope)
            .map((row) => String(row.conversation_id))
        )
        const referencesDeleted = (value: unknown): boolean => {
          if (Array.isArray(value)) return value.some(referencesDeleted)
          if (!value || typeof value !== "object") return false
          return Object.entries(value).some(
            ([key, item]) =>
              (["conversation_id", "conversationId", "threadId"].includes(
                key
              ) &&
                deleted.has(String(item))) ||
              referencesDeleted(item)
          )
        }
        if (referencesDeleted(request.value)) return null
      }
      this.db
        .prepare(
          `INSERT INTO snapshots (scope, path, conversation_id, value, cached_at)
        VALUES (?, ?, ?, ?, ?) ON CONFLICT (scope, path) DO UPDATE SET
        value = excluded.value, cached_at = excluded.cached_at`
        )
        .run(
          scope,
          entry.key,
          entry.conversationId,
          encoded,
          new Date().toISOString()
        )
      this.db
        .prepare(
          `DELETE FROM snapshots WHERE scope = ? AND path IN (
        SELECT path FROM snapshots WHERE scope = ? ORDER BY cached_at DESC, path LIMIT -1 OFFSET ?
      )`
        )
        .run(scope, scope, MAX_SCOPE_ENTRIES)
      return null
    }
    if (request.action === "clear") {
      this.db.prepare("DELETE FROM snapshots WHERE scope = ?").run(scope)
      return null
    }
    if (
      request.action !== "invalidate-conversation" &&
      request.action !== "delete-conversation"
    )
      throw new Error("历史缓存操作无效")
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(request.conversationId))
      throw new Error("会话标识无效")
    this.db.exec("BEGIN IMMEDIATE")
    try {
      this.db
        .prepare(
          "DELETE FROM snapshots WHERE scope = ? AND (conversation_id = ? OR conversation_id IS NULL)"
        )
        .run(scope, request.conversationId)
      if (request.action === "delete-conversation")
        this.db
          .prepare(
            "INSERT OR IGNORE INTO deleted_conversations (scope, conversation_id) VALUES (?, ?)"
          )
          .run(scope, request.conversationId)
      this.db.exec("COMMIT")
    } catch (error) {
      this.db.exec("ROLLBACK")
      throw error
    }
    return null
  }

  private deleted(scope: string, conversationId: string) {
    return Boolean(
      this.db
        .prepare(
          "SELECT 1 FROM deleted_conversations WHERE scope = ? AND conversation_id = ?"
        )
        .get(scope, conversationId)
    )
  }

  close() {
    if (this.closed) return
    this.closed = true
    this.db.close()
  }
}
