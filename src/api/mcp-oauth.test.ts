import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useSessionStore } from "@/lib/session"
import {
  authorizeMcpOauth,
  disconnectMcpOauth,
  getMcpOauth,
  getMcpOauthConfig,
  updateMcpOauthConfig,
  type McpOauthConfigWriteBody,
} from "./mcp-oauth"

function response(data: unknown, code = 200, status = 200, msg = "ok") {
  return new Response(JSON.stringify({ code, msg, data }), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

describe("MCP OAuth client contract", () => {
  beforeEach(async () => {
    await useSessionStore.persist.rehydrate()
    useSessionStore.getState().setSession({
      accessToken: "application-jwt",
      accessTokenExpireTime: "2099-01-01T00:00:00Z",
      sessionUuid: "oauth-session",
    })
    vi.stubGlobal("fetch", vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    useSessionStore.getState().clearSession()
  })

  it("reads the minimal current-user status with the application JWT", async () => {
    const status = {
      configured: true,
      connected: true,
      expires_time: "2020-01-01T00:00:00Z",
    }
    vi.mocked(fetch).mockResolvedValueOnce(response(status))

    expect(await getMcpOauth(42)).toEqual(status)
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(String(url)).toMatch(/\/mcps\/42\/oauth$/)
    expect(init?.method ?? "GET").toBe("GET")
    expect(init?.body).toBeUndefined()
    expect(new Headers(init?.headers).get("Authorization")).toBe(
      "Bearer application-jwt"
    )
  })

  it("authorizes and disconnects without submitting OAuth configuration", async () => {
    const authorization = {
      authorization_url:
        "https://oauth.example.test/authorize?state=one%2Btwo&code_challenge=pkce&scope=a%20b",
      expires_seconds: 600,
    }
    vi.mocked(fetch)
      .mockResolvedValueOnce(response(authorization))
      .mockResolvedValueOnce(response(null))

    expect(await authorizeMcpOauth(42)).toEqual(authorization)
    expect(await disconnectMcpOauth(42)).toBeNull()
    const calls = vi.mocked(fetch).mock.calls
    expect(calls.map(([url]) => String(url))).toEqual([
      expect.stringMatching(/\/mcps\/42\/oauth\/authorize$/),
      expect.stringMatching(/\/mcps\/42\/oauth$/),
    ])
    expect(calls.map(([, init]) => init?.method)).toEqual(["POST", "DELETE"])
    for (const [, init] of calls) {
      expect(init?.body).toBeUndefined()
      expect(new Headers(init?.headers).has("Content-Type")).toBe(false)
      expect(new Headers(init?.headers).get("Authorization")).toBe(
        "Bearer application-jwt"
      )
    }
  })

  it.each([
    { request: getMcpOauth, status: 503, code: 503, msg: "状态暂时不可用" },
    {
      request: authorizeMcpOauth,
      status: 200,
      code: 422,
      msg: "平台未启用 OAuth，请联系管理员",
    },
    {
      request: disconnectMcpOauth,
      status: 403,
      code: 403,
      msg: "没有访问此 MCP 的权限",
    },
  ])("rejects HTTP or envelope failures: $msg", async (failure) => {
    vi.mocked(fetch).mockResolvedValueOnce(
      response(null, failure.code, failure.status, failure.msg)
    )
    await expect(failure.request(42)).rejects.toMatchObject({
      code: failure.code,
      message: failure.msg,
    })
  })

  it("reads and updates the administrator OAuth client config", async () => {
    const config = {
      configured: true,
      enabled: true,
      redirect_uri: "https://buddy.example.test/mcps/42/oauth/callback",
      authorization_url: "https://oauth.example.test/authorize",
      token_url: "https://oauth.example.test/token",
      client_id: "buddy-client",
      has_client_secret: true,
      scope: "openid profile",
      token_endpoint_auth_method: "client_secret_post" as const,
    }
    const body: McpOauthConfigWriteBody = {
      enabled: true,
      authorization_url: config.authorization_url,
      token_url: config.token_url,
      client_id: config.client_id,
      client_secret: null,
      scope: config.scope,
      token_endpoint_auth_method: config.token_endpoint_auth_method,
    }
    vi.mocked(fetch)
      .mockResolvedValueOnce(response(config))
      .mockResolvedValueOnce(response(null))

    expect(await getMcpOauthConfig(42)).toEqual(config)
    expect(await updateMcpOauthConfig(42, body)).toBeNull()

    const calls = vi.mocked(fetch).mock.calls
    expect(calls.map(([url]) => String(url))).toEqual([
      expect.stringMatching(/\/mcps\/42\/oauth\/config$/),
      expect.stringMatching(/\/mcps\/42\/oauth\/config$/),
    ])
    expect(calls.map(([, init]) => init?.method ?? "GET")).toEqual([
      "GET",
      "PUT",
    ])
    expect(calls[0]?.[1]?.body).toBeUndefined()
    expect(calls[1]?.[1]?.body).toBe(JSON.stringify(body))
    for (const [, init] of calls) {
      expect(new Headers(init?.headers).get("Authorization")).toBe(
        "Bearer application-jwt"
      )
    }
  })

  it("cancels a stale authorization request before sending it", async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      authorizeMcpOauth(42, controller.signal)
    ).rejects.toMatchObject({ name: "AbortError" })
    expect(fetch).not.toHaveBeenCalled()
  })
})
