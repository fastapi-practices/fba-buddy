import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  ApiError,
  apiErrorMessage,
  apiRequest,
  formatApiErrorMessage,
  parseApiError,
} from "@/api/http"
import { notifyError } from "@/lib/notify"

vi.mock("@/lib/notify", () => ({
  notifyError: vi.fn(),
}))

describe("apiErrorMessage", () => {
  it("resolves local validation keys but preserves backend messages and resolved fallbacks", () => {
    expect(apiErrorMessage(new Error("common.nameIsRequired"))).toBe(
      "名称不能为空"
    )
    expect(apiErrorMessage(new ApiError(400, "服务端校验失败"))).toBe(
      "服务端校验失败"
    )
    expect(apiErrorMessage(new ApiError(400, "common.nameIsRequired"))).toBe(
      "common.nameIsRequired"
    )
    expect(apiErrorMessage(new Error("Unknown provider"))).toBe(
      "Unknown provider"
    )
    expect(apiErrorMessage(null, "Already translated")).toBe(
      "Already translated"
    )
  })
})

describe("formatApiErrorMessage", () => {
  it("reads fba msg and nested FastAPI detail", () => {
    expect(formatApiErrorMessage("当前模型暂不支持图片生成")).toBe(
      "当前模型暂不支持图片生成"
    )
    expect(
      formatApiErrorMessage([{ msg: "Field required" }, { msg: "too short" }])
    ).toBe("Field required; too short")
    expect(formatApiErrorMessage({ detail: "Not Found" })).toBe("Not Found")
  })
})

describe("parseApiError", () => {
  it("prefers backend msg over HTTP status text", () => {
    expect(
      parseApiError(
        {
          code: 400,
          msg: "当前图片生成仅支持 Google 或 OpenAI Responses 供应商",
        },
        400,
        "Bad Request",
        "请求失败"
      )
    ).toEqual({
      code: 400,
      message: "当前图片生成仅支持 Google 或 OpenAI Responses 供应商",
    })
  })

  it("falls back to status text when the body is empty", () => {
    expect(parseApiError(null, 502, "Bad Gateway", "请求失败")).toEqual({
      code: 502,
      message: "Bad Gateway",
    })
  })
})

describe("apiRequest", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("not stubbed")
      })
    )
    vi.mocked(notifyError).mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("toasts the backend msg when code is not 200", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({ code: 400, msg: "请先配置模型供应商", data: null }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    )
    await expect(apiRequest("/model-options")).rejects.toMatchObject({
      code: 400,
      message: "请先配置模型供应商",
    })
    expect(notifyError).toHaveBeenCalledWith("请先配置模型供应商")
  })

  it("toasts a network error when fetch fails", async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError("Failed to fetch"))
    await expect(apiRequest("/model-options")).rejects.toMatchObject({
      message: "网络异常",
    })
    expect(notifyError).toHaveBeenCalledWith("网络异常")
  })

  it("does not force JSON content type for FormData bodies", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ code: 200, data: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    )
    const body = new FormData()
    body.append("file", new File(["zip"], "skill.zip"))
    await apiRequest("/skills/me", { method: "POST", body })
    const headers = vi.mocked(fetch).mock.calls[0]?.[1]?.headers as Headers
    expect(headers.get("Content-Type")).toBeNull()
  })

  it("skips the toast when silent is set", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({ code: 400, msg: "验证码错误", data: null }),
        {
          status: 400,
        }
      )
    )
    await expect(
      apiRequest("/auth/login", { method: "POST", silent: true })
    ).rejects.toBeInstanceOf(ApiError)
    expect(notifyError).not.toHaveBeenCalled()
  })
})
