import { afterEach, describe, expect, it } from "vitest"
import { codingRuntimeFromMessage } from "@/lib/execution-runtime"
import { setRuntime } from "@/lib/runtime"

import {
  errorMessageFromStatus,
  formatErrorDetail,
  hasErrorDetail,
  threadErrorPayload,
  visibleAssistantContent,
} from "@/features/chat/message-error"

afterEach(() => setRuntime({ locale: "zh-CN" }))

it("shows a manual runtime installation hint for IPC and local execution errors", () => {
  const message =
    "Error invoking remote method 'desktop:execution-prepare': Error: Install the managed node runtime before local execution"
  const hint = "请在设置 → 运行环境 → 运行组件中安装 Node.js"
  expect(errorMessageFromStatus({ message })).toBe(hint)
  expect(threadErrorPayload({ error: message })).toBe(hint)
  expect(
    visibleAssistantContent({
      status: "error",
      content: message,
      error: message,
    })
  ).toBe("")
  expect(
    errorMessageFromStatus(
      "Install the managed python runtime before local execution"
    )
  ).toContain("运行组件中安装 Python")
  setRuntime({ locale: "en-US" })
  expect(errorMessageFromStatus(message)).toContain(
    "Install Node.js in Settings → Runtime environment → Runtime components"
  )
})

it("recognizes the runtime from a translated installation hint", () => {
  expect(
    codingRuntimeFromMessage(
      "请在设置 → 运行环境 → 运行组件中安装 Node.js"
    )
  ).toBe("node")
  expect(
    codingRuntimeFromMessage(
      "Install Python in Settings → Runtime environment → Runtime components"
    )
  ).toBe("python")
})

describe("visibleAssistantContent", () => {
  it("keeps partial stream text next to a separate error", () => {
    expect(
      visibleAssistantContent({
        status: "error",
        content: "已经写了一半",
        error: "上游超时",
      })
    ).toBe("已经写了一半")
  })

  it("hides content that is only the backend error text", () => {
    expect(
      visibleAssistantContent({
        status: "error",
        content: "生成失败",
        error: "生成失败",
      })
    ).toBe("")
  })
})

describe("threadErrorPayload", () => {
  it("keeps a plain error string when there is no detail", () => {
    expect(threadErrorPayload({ error: "上游超时" })).toBe("上游超时")
  })

  it("puts the display message on top of backend error detail", () => {
    expect(
      threadErrorPayload({
        error: "Invalid request",
        errorDetail: { type: "UserError", message: "ignored" },
      })
    ).toEqual({
      type: "UserError",
      message: "Invalid request",
    })
  })
})

describe("errorMessageFromStatus", () => {
  it("reads a string or a backend message field", () => {
    expect(errorMessageFromStatus("上游超时")).toBe("上游超时")
    expect(errorMessageFromStatus({ message: "Invalid request" })).toBe(
      "Invalid request"
    )
  })
})

describe("hasErrorDetail", () => {
  it("is false for a plain message", () => {
    expect(hasErrorDetail("上游超时")).toBe(false)
    expect(hasErrorDetail({ message: "上游超时" })).toBe(false)
  })

  it("is true when backend detail has more than the message", () => {
    expect(
      hasErrorDetail({
        message: "Invalid request",
        type: "UserError",
        status_code: 400,
      })
    ).toBe(true)
  })
})

describe("formatErrorDetail", () => {
  it("pretty-prints backend detail without repeating the message", () => {
    expect(
      formatErrorDetail({
        message: "Invalid request",
        type: "UserError",
        body: { msg: "too long" },
      })
    ).toBe(
      JSON.stringify(
        {
          type: "UserError",
          body: { msg: "too long" },
        },
        null,
        2
      )
    )
  })
})
