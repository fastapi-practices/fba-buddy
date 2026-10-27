import { createHash } from "node:crypto"
import type { AccountSource } from "../src/shared/account-source"

export function normalizeAccountSource(value: AccountSource): AccountSource {
  if (
    !value ||
    typeof value.backendUrl !== "string" ||
    value.backendUrl.length > 2048 ||
    typeof value.accountId !== "string" ||
    !value.accountId.trim() ||
    value.accountId.length > 128 ||
    /[\0\r\n]/.test(value.accountId)
  )
    throw new Error("账号数据源无效")
  const url = new URL(value.backendUrl)
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error("后端地址无效")
  return {
    backendUrl: url.toString().replace(/\/+$/, ""),
    accountId: value.accountId,
  }
}

export function accountSourceHash(value: AccountSource) {
  const source = normalizeAccountSource(value)
  return createHash("sha256")
    .update(JSON.stringify([source.backendUrl, source.accountId]))
    .digest("hex")
}

export function executionProfileKey(
  source: AccountSource,
  conversationId: string
) {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(conversationId))
    throw new Error("会话标识无效")
  return `${accountSourceHash(source)}:${conversationId}`
}
